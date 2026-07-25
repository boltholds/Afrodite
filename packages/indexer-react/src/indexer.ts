import path from "node:path";
import ts from "typescript";
import { reactFrameworkDescriptor } from "@afrodite/adapter-react";
import type {
  ComponentCatalog,
  IndexDiagnostic,
  IndexedComponent,
  IndexedProp,
  JsonValue,
  PropValueKind,
  SourceLocation,
} from "@afrodite/protocol";

export interface IndexReactProjectOptions {
  projectRoot: string;
  tsconfigPath?: string;
}

type ComponentDeclaration = ts.FunctionDeclaration | ts.VariableDeclaration;
type ComponentFunction = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

interface Candidate {
  declaration: ComponentDeclaration;
  exportNames: Set<string>;
}

interface TypeAssessment {
  serializable: boolean;
  valueKind: PropValueKind;
  reason?: string;
}

const REACT_COMPONENT_TYPE = /(?:^|\W)(?:FC|FunctionComponent|ComponentType|MemoExoticComponent|ForwardRefExoticComponent)\s*</;
const NON_SERIALIZABLE_OBJECTS = new Set([
  "AbortSignal",
  "Date",
  "Element",
  "Event",
  "File",
  "HTMLElement",
  "Map",
  "Node",
  "Promise",
  "ReactElement",
  "ReactNode",
  "RegExp",
  "Set",
  "WeakMap",
  "WeakSet",
]);

export function indexReactProject(options: IndexReactProjectOptions): ComponentCatalog {
  const projectRoot = path.resolve(options.projectRoot);
  const requestedConfig = options.tsconfigPath
    ? path.resolve(projectRoot, options.tsconfigPath)
    : ts.findConfigFile(projectRoot, ts.sys.fileExists, "tsconfig.json");

  if (!requestedConfig) {
    return emptyCatalog(projectRoot, path.join(projectRoot, "tsconfig.json"), {
      code: "TSCONFIG_NOT_FOUND",
      severity: "error",
      message: `No tsconfig.json was found under ${projectRoot}.`,
    });
  }

  const configResult = ts.readConfigFile(requestedConfig, ts.sys.readFile);
  if (configResult.error) {
    return emptyCatalog(
      projectRoot,
      requestedConfig,
      toTypescriptDiagnostic(configResult.error, projectRoot),
    );
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configResult.config,
    ts.sys,
    path.dirname(requestedConfig),
    { noEmit: true },
    requestedConfig,
  );
  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
    projectReferences: parsedConfig.projectReferences,
  });
  const checker = program.getTypeChecker();
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) => toTypescriptDiagnostic(diagnostic, projectRoot));
  const candidates = collectExportedCandidates(program, checker, projectRoot);
  const components: IndexedComponent[] = [];

  for (const candidate of candidates.values()) {
    const exportName = chooseExportName(candidate);
    const componentName = exportName === "default"
      ? getDeclarationName(candidate.declaration) ?? "DefaultComponent"
      : exportName;
    const componentFunction = resolveComponentFunction(candidate.declaration);

    if (!isReactComponent(candidate.declaration, componentFunction, componentName)) continue;

    const sourceFile = candidate.declaration.getSourceFile();
    const sourcePath = toProjectPath(sourceFile.fileName, projectRoot);
    const location = getLocation(sourceFile, candidate.declaration.getStart(sourceFile));

    if (isServerOnlySource(sourceFile)) {
      diagnostics.push(createReactDiagnostic({
        code: "SERVER_COMPONENT_UNSUPPORTED",
        severity: "warning",
        message: `${componentName} is declared in a server-only module and cannot run in the browser preview.`,
        sourcePath,
        location,
        componentName,
      }));
      continue;
    }

    if (componentFunction && isAsyncFunction(componentFunction)) {
      diagnostics.push(createReactDiagnostic({
        code: "ASYNC_COMPONENT_UNSUPPORTED",
        severity: "warning",
        message: `${componentName} is async. The client preview accepts synchronous React components only.`,
        sourcePath,
        location,
        componentName,
      }));
      continue;
    }

    if (componentFunction && usesReactContext(componentFunction)) {
      diagnostics.push(createReactDiagnostic({
        code: "CONTEXT_DEPENDENCY_UNSUPPORTED",
        severity: "warning",
        message: `${componentName} reads React context. Preview output may require an explicitly registered provider harness.`,
        sourcePath,
        location,
        componentName,
      }));
    }

    const componentDiagnostics: IndexDiagnostic[] = [];
    const props = extractProps(
      candidate.declaration,
      componentFunction,
      checker,
      projectRoot,
      componentName,
      componentDiagnostics,
    );
    diagnostics.push(...componentDiagnostics);

    components.push({
      id: `react:${sourcePath}#${exportName}`,
      frameworkId: reactFrameworkDescriptor.frameworkId,
      adapterId: reactFrameworkDescriptor.adapterId,
      name: componentName,
      exportName,
      sourcePath,
      location,
      declarationKind: ts.isFunctionDeclaration(candidate.declaration) ? "function" : "variable",
      props,
    });
  }

  components.sort((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath) || left.name.localeCompare(right.name),
  );
  diagnostics.sort((left, right) =>
    (left.sourcePath ?? "").localeCompare(right.sourcePath ?? "")
    || (left.location?.line ?? 0) - (right.location?.line ?? 0)
    || left.code.localeCompare(right.code),
  );

  return {
    schemaVersion: 1,
    projectRoot,
    tsconfigPath: requestedConfig,
    frameworks: [reactFrameworkDescriptor],
    components,
    diagnostics,
  };
}

export function serializeReactComponentCatalog(catalog: ComponentCatalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

function emptyCatalog(
  projectRoot: string,
  tsconfigPath: string,
  diagnostic: Omit<IndexDiagnostic, "frameworkId" | "adapterId">,
): ComponentCatalog {
  return {
    schemaVersion: 1,
    projectRoot,
    tsconfigPath,
    frameworks: [reactFrameworkDescriptor],
    components: [],
    diagnostics: [createReactDiagnostic(diagnostic)],
  };
}

function createReactDiagnostic(
  diagnostic: Omit<IndexDiagnostic, "frameworkId" | "adapterId">,
): IndexDiagnostic {
  return {
    ...diagnostic,
    frameworkId: reactFrameworkDescriptor.frameworkId,
    adapterId: reactFrameworkDescriptor.adapterId,
  };
}

function collectExportedCandidates(
  program: ts.Program,
  checker: ts.TypeChecker,
  projectRoot: string,
): Map<string, Candidate> {
  const candidates = new Map<string, Candidate>();

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile || !isInsideProject(sourceFile.fileName, projectRoot)) continue;
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol) continue;

    for (const exportedSymbol of checker.getExportsOfModule(moduleSymbol)) {
      const targetSymbol = exportedSymbol.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exportedSymbol)
        : exportedSymbol;

      for (const declaration of targetSymbol.getDeclarations() ?? []) {
        const componentDeclaration = asComponentDeclaration(declaration);
        if (!componentDeclaration) continue;
        const declarationFile = componentDeclaration.getSourceFile();
        if (!isInsideProject(declarationFile.fileName, projectRoot)) continue;

        const key = `${path.resolve(declarationFile.fileName)}:${componentDeclaration.pos}`;
        const candidate = candidates.get(key) ?? {
          declaration: componentDeclaration,
          exportNames: new Set<string>(),
        };
        candidate.exportNames.add(exportedSymbol.getName());
        candidates.set(key, candidate);
      }
    }
  }

  return candidates;
}

function asComponentDeclaration(declaration: ts.Declaration): ComponentDeclaration | undefined {
  if (ts.isFunctionDeclaration(declaration) || ts.isVariableDeclaration(declaration)) {
    return declaration;
  }
  return undefined;
}

function chooseExportName(candidate: Candidate): string {
  const declarationName = getDeclarationName(candidate.declaration);
  if (declarationName && candidate.exportNames.has(declarationName)) return declarationName;

  const namedExports = [...candidate.exportNames]
    .filter((name) => name !== "default" && isPascalCase(name))
    .sort();
  return namedExports[0] ?? declarationName ?? "default";
}

function getDeclarationName(declaration: ComponentDeclaration): string | undefined {
  const name = declaration.name;
  return name && ts.isIdentifier(name) ? name.text : undefined;
}

function resolveComponentFunction(declaration: ComponentDeclaration): ComponentFunction | undefined {
  if (ts.isFunctionDeclaration(declaration)) return declaration;
  return declaration.initializer ? findFunctionExpression(declaration.initializer) : undefined;
}

function findFunctionExpression(expression: ts.Expression): ComponentFunction | undefined {
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return expression;
  if (
    ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isNonNullExpression(expression)
    || ts.isSatisfiesExpression(expression)
  ) {
    return findFunctionExpression(expression.expression);
  }
  if (ts.isCallExpression(expression)) {
    for (const argument of expression.arguments) {
      if (!ts.isExpression(argument)) continue;
      const nested = findFunctionExpression(argument);
      if (nested) return nested;
    }
  }
  return undefined;
}

function isReactComponent(
  declaration: ComponentDeclaration,
  componentFunction: ComponentFunction | undefined,
  name: string,
): boolean {
  if (!isPascalCase(name)) return false;
  if (componentFunction?.body && containsJsx(componentFunction.body)) return true;
  if (ts.isVariableDeclaration(declaration) && declaration.type) {
    return REACT_COMPONENT_TYPE.test(declaration.type.getText());
  }
  return false;
}

function isPascalCase(value: string): boolean {
  return /^[A-Z][A-Za-z0-9_$]*$/.test(value);
}

function containsJsx(node: ts.Node): boolean {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
    return true;
  }
  let found = false;
  node.forEachChild((child) => {
    if (!found && containsJsx(child)) found = true;
  });
  return found;
}

function isAsyncFunction(declaration: ComponentFunction): boolean {
  return declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
}

function isServerOnlySource(sourceFile: ts.SourceFile): boolean {
  if (/\.server\.[cm]?[jt]sx?$/i.test(sourceFile.fileName)) return true;

  for (const statement of sourceFile.statements) {
    if (
      ts.isExpressionStatement(statement)
      && ts.isStringLiteral(statement.expression)
      && statement.expression.text === "use server"
    ) {
      return true;
    }
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const moduleName = statement.moduleSpecifier.text;
      if (moduleName === "server-only" || moduleName === "next/headers" || moduleName === "next/server") {
        return true;
      }
    }
  }
  return false;
}

function usesReactContext(declaration: ComponentFunction): boolean {
  if (!declaration.body) return false;
  let found = false;

  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (
        (ts.isIdentifier(expression) && expression.text === "useContext")
        || (ts.isPropertyAccessExpression(expression) && expression.name.text === "useContext")
      ) {
        found = true;
        return;
      }
    }
    node.forEachChild(visit);
  };

  visit(declaration.body);
  return found;
}

function extractProps(
  declaration: ComponentDeclaration,
  componentFunction: ComponentFunction | undefined,
  checker: ts.TypeChecker,
  projectRoot: string,
  componentName: string,
  diagnostics: IndexDiagnostic[],
): IndexedProp[] {
  const parameter = componentFunction?.parameters[0] ?? getTypedPropsParameter(declaration, checker);
  if (!parameter) return [];

  const propsType = checker.getTypeAtLocation(parameter);
  if (propsType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
    const sourceFile = declaration.getSourceFile();
    diagnostics.push(createReactDiagnostic({
      code: "UNRESOLVED_PROPS",
      severity: "warning",
      message: `Props for ${componentName} resolve to ${checker.typeToString(propsType)}. Add an explicit props type.`,
      sourcePath: toProjectPath(sourceFile.fileName, projectRoot),
      location: getLocation(sourceFile, parameter.getStart(sourceFile)),
      componentName,
    }));
    return [];
  }

  const defaults = getDestructuredDefaults(parameter);
  const props: IndexedProp[] = [];

  for (const propSymbol of checker.getPropertiesOfType(propsType)) {
    const propType = checker.getTypeOfSymbolAtLocation(propSymbol, parameter);
    const typeText = checker.typeToString(
      propType,
      parameter,
      ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
    );
    const assessment = assessType(propType, checker, new Set<ts.Type>());
    const description = ts.displayPartsToString(propSymbol.getDocumentationComment(checker)).trim();
    const defaultValue = defaults.get(propSymbol.getName());

    props.push({
      name: propSymbol.getName(),
      typeText,
      required: !(propSymbol.flags & ts.SymbolFlags.Optional) && !containsUndefined(propType),
      serializable: assessment.serializable,
      valueKind: assessment.valueKind,
      ...(description ? { description } : {}),
      ...(defaultValue !== undefined ? { defaultValue } : {}),
    });

    if (!assessment.serializable) {
      const propDeclaration = propSymbol.valueDeclaration ?? propSymbol.declarations?.[0];
      const sourceFile = propDeclaration?.getSourceFile() ?? declaration.getSourceFile();
      const position = propDeclaration?.getStart(sourceFile) ?? declaration.getStart(sourceFile);
      diagnostics.push(createReactDiagnostic({
        code: "UNSUPPORTED_PROP_TYPE",
        severity: "warning",
        message: `Prop ${componentName}.${propSymbol.getName()} is runtime-only: ${assessment.reason ?? typeText}.`,
        sourcePath: toProjectPath(sourceFile.fileName, projectRoot),
        location: getLocation(sourceFile, position),
        componentName,
        propName: propSymbol.getName(),
      }));
    }
  }

  props.sort((left, right) => left.name.localeCompare(right.name));
  return props;
}

function getTypedPropsParameter(
  declaration: ComponentDeclaration,
  checker: ts.TypeChecker,
): ts.ParameterDeclaration | undefined {
  if (ts.isFunctionDeclaration(declaration)) return declaration.parameters[0];
  const variableType = checker.getTypeAtLocation(declaration.name);
  const signature = checker.getSignaturesOfType(variableType, ts.SignatureKind.Call)[0];
  const symbol = signature?.getParameters()[0];
  const parameterDeclaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
  return parameterDeclaration && ts.isParameter(parameterDeclaration)
    ? parameterDeclaration
    : undefined;
}

function getDestructuredDefaults(parameter: ts.ParameterDeclaration): Map<string, JsonValue> {
  const defaults = new Map<string, JsonValue>();
  if (!ts.isObjectBindingPattern(parameter.name)) return defaults;

  for (const element of parameter.name.elements) {
    if (!element.initializer || !ts.isIdentifier(element.name)) continue;
    const value = expressionToJson(element.initializer);
    if (value !== undefined) defaults.set(element.name.text, value);
  }
  return defaults;
}

function expressionToJson(expression: ts.Expression): JsonValue | undefined {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (expression.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(expression) && ts.isNumericLiteral(expression.operand)) {
    const value = Number(expression.operand.text);
    return expression.operator === ts.SyntaxKind.MinusToken ? -value : value;
  }
  if (ts.isArrayLiteralExpression(expression)) {
    const values: JsonValue[] = [];
    for (const element of expression.elements) {
      if (ts.isSpreadElement(element)) return undefined;
      const value = expressionToJson(element);
      if (value === undefined) return undefined;
      values.push(value);
    }
    return values;
  }
  if (ts.isObjectLiteralExpression(expression)) {
    const result: Record<string, JsonValue> = {};
    for (const property of expression.properties) {
      if (!ts.isPropertyAssignment(property)) return undefined;
      const key = propertyName(property.name);
      const value = expressionToJson(property.initializer);
      if (!key || value === undefined) return undefined;
      result[key] = value;
    }
    return result;
  }
  return undefined;
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function assessType(
  type: ts.Type,
  checker: ts.TypeChecker,
  seen: Set<ts.Type>,
): TypeAssessment {
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
    return unsupported("unconstrained any/unknown values");
  }
  if (type.flags & ts.TypeFlags.Undefined) return unsupported("undefined is not a persisted value");
  if (type.flags & ts.TypeFlags.Null) return supported("null");
  if (type.flags & ts.TypeFlags.StringLiteral) return supported("literal");
  if (type.flags & ts.TypeFlags.NumberLiteral) return supported("literal");
  if (type.flags & ts.TypeFlags.BooleanLiteral) return supported("literal");
  if (type.flags & ts.TypeFlags.StringLike) return supported("string");
  if (type.flags & ts.TypeFlags.NumberLike) return supported("number");
  if (type.flags & ts.TypeFlags.BooleanLike) return supported("boolean");

  if (type.isUnion()) {
    const members = type.types.filter((member) => !(member.flags & ts.TypeFlags.Undefined));
    if (members.length === 0) return unsupported("an undefined-only union");
    if (members.every(isLiteralType)) return supported(members.length > 1 ? "enum" : "literal");
    const assessments = members.map((member) => assessType(member, checker, new Set(seen)));
    if (assessments.every((assessment) => assessment.serializable)) {
      const kinds = new Set(assessments.map((assessment) => assessment.valueKind));
      if (kinds.size === 1) return assessments[0] ?? supported("unknown");
    }
    return unsupported(`union ${checker.typeToString(type)} has incompatible JSON shapes`);
  }

  if (checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0) {
    return unsupported("functions and callbacks execute runtime behavior");
  }

  const symbolName = type.aliasSymbol?.getName() ?? type.getSymbol()?.getName();
  const typeText = checker.typeToString(type);
  if (
    (symbolName && NON_SERIALIZABLE_OBJECTS.has(symbolName))
    || /(?:ReactNode|ReactElement|JSX\.Element|MouseEvent|KeyboardEvent|SyntheticEvent)/.test(typeText)
  ) {
    return unsupported(`${typeText} is a runtime React or platform object`);
  }

  if (checker.isArrayType(type)) {
    const element = checker.getTypeArguments(type as ts.TypeReference)[0];
    if (!element) return unsupported("array element type is unresolved");
    const assessment = assessType(element, checker, new Set(seen));
    return assessment.serializable ? supported("array") : unsupported(assessment.reason ?? typeText);
  }

  if (checker.isTupleType(type)) {
    const elements = checker.getTypeArguments(type as ts.TypeReference);
    const assessments = elements.map((element) => assessType(element, checker, new Set(seen)));
    return assessments.every((assessment) => assessment.serializable)
      ? supported("array")
      : unsupported(assessments.find((assessment) => !assessment.serializable)?.reason ?? typeText);
  }

  if (type.flags & ts.TypeFlags.Object) {
    if (seen.has(type)) return unsupported("recursive object types cannot be persisted safely");
    const nextSeen = new Set(seen);
    nextSeen.add(type);

    const properties = checker.getPropertiesOfType(type);
    for (const property of properties) {
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      const propertyType = checker.getTypeOfSymbolAtLocation(property, declaration ?? type.symbol?.valueDeclaration ?? declaration!);
      const assessment = assessType(propertyType, checker, nextSeen);
      if (!assessment.serializable && !(property.flags & ts.SymbolFlags.Optional)) {
        return unsupported(`property ${property.getName()} is not JSON-safe: ${assessment.reason ?? checker.typeToString(propertyType)}`);
      }
    }

    const stringIndex = checker.getIndexTypeOfType(type, ts.IndexKind.String);
    if (stringIndex) {
      const assessment = assessType(stringIndex, checker, nextSeen);
      if (!assessment.serializable) return unsupported(assessment.reason ?? typeText);
    }
    return supported("object");
  }

  return unsupported(`type ${typeText} is not JSON-safe`);
}

function isLiteralType(type: ts.Type): boolean {
  return Boolean(type.flags & (
    ts.TypeFlags.StringLiteral
    | ts.TypeFlags.NumberLiteral
    | ts.TypeFlags.BooleanLiteral
    | ts.TypeFlags.Null
  ));
}

function supported(valueKind: PropValueKind): TypeAssessment {
  return { serializable: true, valueKind };
}

function unsupported(reason: string): TypeAssessment {
  return { serializable: false, valueKind: "unknown", reason };
}

function containsUndefined(type: ts.Type): boolean {
  return Boolean(type.flags & ts.TypeFlags.Undefined)
    || (type.isUnion() && type.types.some((member) => Boolean(member.flags & ts.TypeFlags.Undefined)));
}

function toTypescriptDiagnostic(
  diagnostic: ts.Diagnostic,
  projectRoot: string,
): IndexDiagnostic {
  const sourceFile = diagnostic.file;
  const location = sourceFile && diagnostic.start !== undefined
    ? getLocation(sourceFile, diagnostic.start)
    : undefined;
  return createReactDiagnostic({
    code: diagnostic.code === 5083 ? "TSCONFIG_READ_FAILED" : "TYPESCRIPT_DIAGNOSTIC",
    severity: diagnostic.category === ts.DiagnosticCategory.Error ? "error" : "warning",
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    ...(sourceFile ? { sourcePath: toProjectPath(sourceFile.fileName, projectRoot) } : {}),
    ...(location ? { location } : {}),
  });
}

function getLocation(sourceFile: ts.SourceFile, position: number): SourceLocation {
  const location = sourceFile.getLineAndCharacterOfPosition(position);
  return { line: location.line + 1, column: location.character + 1 };
}

function toProjectPath(fileName: string, projectRoot: string): string {
  return path.relative(projectRoot, fileName).split(path.sep).join("/");
}

function isInsideProject(fileName: string, projectRoot: string): boolean {
  const relative = path.relative(projectRoot, fileName);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
