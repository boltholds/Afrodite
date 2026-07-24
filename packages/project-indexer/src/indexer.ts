import path from "node:path";
import ts from "typescript";
import type {
  ComponentCatalog,
  IndexDiagnostic,
  IndexedComponent,
  IndexedProp,
  IndexSolidProjectOptions,
  JsonValue,
  PropValueKind,
  SourceLocation,
} from "./catalog.js";

type ComponentDeclaration = ts.FunctionDeclaration | ts.VariableDeclaration;

interface Candidate {
  declaration: ComponentDeclaration;
  exportNames: Set<string>;
}

interface TypeAssessment {
  serializable: boolean;
  valueKind: PropValueKind;
  reason?: string;
}

const SOLID_COMPONENT_TYPE = /(?:^|\W)(?:Component|ParentComponent|VoidComponent|FlowComponent)\s*</;
const NON_SERIALIZABLE_OBJECTS = new Set([
  "Date",
  "Element",
  "Event",
  "File",
  "HTMLElement",
  "Map",
  "Node",
  "Promise",
  "RegExp",
  "Set",
  "WeakMap",
  "WeakSet",
]);

export function indexSolidProject(options: IndexSolidProjectOptions): ComponentCatalog {
  const projectRoot = path.resolve(options.projectRoot);
  const requestedConfig = options.tsconfigPath
    ? path.resolve(projectRoot, options.tsconfigPath)
    : ts.findConfigFile(projectRoot, ts.sys.fileExists, "tsconfig.json");

  if (!requestedConfig) {
    return {
      schemaVersion: 1,
      projectRoot,
      tsconfigPath: path.join(projectRoot, "tsconfig.json"),
      components: [],
      diagnostics: [
        {
          code: "TSCONFIG_NOT_FOUND",
          severity: "error",
          message: `No tsconfig.json was found under ${projectRoot}.`,
        },
      ],
    };
  }

  const configResult = ts.readConfigFile(requestedConfig, ts.sys.readFile);
  if (configResult.error) {
    return {
      schemaVersion: 1,
      projectRoot,
      tsconfigPath: requestedConfig,
      components: [],
      diagnostics: [toTypescriptDiagnostic(configResult.error, projectRoot)],
    };
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
    if (!isSolidComponent(candidate.declaration, exportName)) continue;

    const componentName = exportName === "default"
      ? getDeclarationName(candidate.declaration) ?? "DefaultComponent"
      : exportName;
    const componentDiagnostics: IndexDiagnostic[] = [];
    const props = extractProps(
      candidate.declaration,
      checker,
      projectRoot,
      componentName,
      componentDiagnostics,
    );
    diagnostics.push(...componentDiagnostics);

    const sourceFile = candidate.declaration.getSourceFile();
    const sourcePath = toProjectPath(sourceFile.fileName, projectRoot);
    components.push({
      id: `${sourcePath}#${exportName}`,
      name: componentName,
      exportName,
      sourcePath,
      location: getLocation(sourceFile, candidate.declaration.getStart(sourceFile)),
      declarationKind: ts.isFunctionDeclaration(candidate.declaration) ? "function" : "variable",
      props,
    });
  }

  components.sort((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath) || left.name.localeCompare(right.name),
  );
  diagnostics.sort((left, right) =>
    (left.sourcePath ?? "").localeCompare(right.sourcePath ?? "") ||
    (left.location?.line ?? 0) - (right.location?.line ?? 0) ||
    left.code.localeCompare(right.code),
  );

  return {
    schemaVersion: 1,
    projectRoot,
    tsconfigPath: requestedConfig,
    components,
    diagnostics,
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

function isSolidComponent(declaration: ComponentDeclaration, exportName: string): boolean {
  const name = exportName === "default" ? getDeclarationName(declaration) : exportName;
  if (!name || !isPascalCase(name)) return false;

  if (ts.isFunctionDeclaration(declaration)) {
    return Boolean(declaration.body && containsJsx(declaration.body));
  }

  if (declaration.initializer && containsJsx(declaration.initializer)) return true;
  return Boolean(declaration.type && SOLID_COMPONENT_TYPE.test(declaration.type.getText()));
}

function isPascalCase(value: string): boolean {
  return /^[A-Z][A-Za-z0-9_$]*$/.test(value);
}

function containsJsx(node: ts.Node): boolean {
  if (
    ts.isJsxElement(node) ||
    ts.isJsxSelfClosingElement(node) ||
    ts.isJsxFragment(node)
  ) {
    return true;
  }

  let found = false;
  node.forEachChild((child) => {
    if (!found && containsJsx(child)) found = true;
  });
  return found;
}

function extractProps(
  declaration: ComponentDeclaration,
  checker: ts.TypeChecker,
  projectRoot: string,
  componentName: string,
  diagnostics: IndexDiagnostic[],
): IndexedProp[] {
  const parameter = getPropsParameter(declaration, checker);
  if (!parameter) return [];

  const propsType = checker.getTypeAtLocation(parameter);
  if (propsType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
    const sourceFile = declaration.getSourceFile();
    diagnostics.push({
      code: "UNRESOLVED_PROPS",
      severity: "warning",
      message: `Props for ${componentName} resolve to ${checker.typeToString(propsType)}. Add an explicit props type to make the component indexable.`,
      sourcePath: toProjectPath(sourceFile.fileName, projectRoot),
      location: getLocation(sourceFile, parameter.getStart(sourceFile)),
      componentName,
    });
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
    const indexedProp: IndexedProp = {
      name: propSymbol.getName(),
      typeText,
      required: !(propSymbol.flags & ts.SymbolFlags.Optional) && !containsUndefined(propType),
      serializable: assessment.serializable,
      valueKind: assessment.valueKind,
      ...(description ? { description } : {}),
      ...(defaultValue !== undefined ? { defaultValue } : {}),
    };
    props.push(indexedProp);

    if (!assessment.serializable) {
      const propDeclaration = propSymbol.valueDeclaration ?? propSymbol.declarations?.[0];
      const sourceFile = propDeclaration?.getSourceFile() ?? declaration.getSourceFile();
      const position = propDeclaration?.getStart(sourceFile) ?? declaration.getStart(sourceFile);
      diagnostics.push({
        code: "UNSUPPORTED_PROP_TYPE",
        severity: "warning",
        message: `Prop ${componentName}.${propSymbol.getName()} cannot be represented safely in UI IR: ${assessment.reason ?? typeText}.`,
        sourcePath: toProjectPath(sourceFile.fileName, projectRoot),
        location: getLocation(sourceFile, position),
        componentName,
        propName: propSymbol.getName(),
      });
    }
  }

  props.sort((left, right) => left.name.localeCompare(right.name));
  return props;
}

function getPropsParameter(
  declaration: ComponentDeclaration,
  checker: ts.TypeChecker,
): ts.ParameterDeclaration | undefined {
  if (ts.isFunctionDeclaration(declaration)) return declaration.parameters[0];

  const initializer = declaration.initializer;
  if (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
    const parameter = initializer.parameters[0];
    if (parameter) return parameter;
  }

  const variableType = checker.getTypeAtLocation(declaration.name);
  const signature = checker.getSignaturesOfType(variableType, ts.SignatureKind.Call)[0];
  const parameterSymbol = signature?.getParameters()[0];
  const parameterDeclaration = parameterSymbol?.valueDeclaration ?? parameterSymbol?.declarations?.[0];
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
    const value: Record<string, JsonValue> = {};
    for (const property of expression.properties) {
      if (!ts.isPropertyAssignment(property)) return undefined;
      const key = getPropertyName(property.name);
      const propertyValue = expressionToJson(property.initializer);
      if (!key || propertyValue === undefined) return undefined;
      value[key] = propertyValue;
    }
    return value;
  }
  return undefined;
}

function getPropertyName(name: ts.PropertyName): string | undefined {
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
  if (type.flags & ts.TypeFlags.Undefined) {
    return { serializable: true, valueKind: "null" };
  }
  if (type.flags & ts.TypeFlags.Null) {
    return { serializable: true, valueKind: "null" };
  }
  if (type.flags & ts.TypeFlags.StringLiteral) {
    return { serializable: true, valueKind: "literal" };
  }
  if (type.flags & ts.TypeFlags.NumberLiteral) {
    return { serializable: true, valueKind: "literal" };
  }
  if (type.flags & ts.TypeFlags.BooleanLiteral) {
    return { serializable: true, valueKind: "literal" };
  }
  if (type.flags & ts.TypeFlags.StringLike) {
    return { serializable: true, valueKind: "string" };
  }
  if (type.flags & ts.TypeFlags.NumberLike) {
    return { serializable: true, valueKind: "number" };
  }
  if (type.flags & ts.TypeFlags.BooleanLike) {
    return { serializable: true, valueKind: "boolean" };
  }
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter)) {
    return {
      serializable: false,
      valueKind: "unknown",
      reason: `type ${checker.typeToString(type)} is not statically constrained`,
    };
  }
  if (type.flags & (ts.TypeFlags.BigIntLike | ts.TypeFlags.ESSymbolLike | ts.TypeFlags.Never)) {
    return {
      serializable: false,
      valueKind: "unknown",
      reason: `type ${checker.typeToString(type)} is not JSON-compatible`,
    };
  }

  if (type.isUnion()) {
    const members = type.types.filter((member) => !(member.flags & ts.TypeFlags.Undefined));
    const assessments = members.map((member) => assessType(member, checker, new Set(seen)));
    const serializable = assessments.every((assessment) => assessment.serializable);
    const literalUnion = members.length > 1 && members.every((member) =>
      Boolean(member.flags & (
        ts.TypeFlags.StringLiteral |
        ts.TypeFlags.NumberLiteral |
        ts.TypeFlags.BooleanLiteral |
        ts.TypeFlags.Null
      )),
    );
    return {
      serializable,
      valueKind: literalUnion ? "enum" : assessments[0]?.valueKind ?? "unknown",
      ...(!serializable
        ? { reason: assessments.find((assessment) => !assessment.serializable)?.reason ?? "union contains an unsupported member" }
        : {}),
    };
  }

  if (type.isIntersection()) {
    const assessments = type.types.map((member) => assessType(member, checker, new Set(seen)));
    const failed = assessments.find((assessment) => !assessment.serializable);
    return failed
      ? { serializable: false, valueKind: "unknown", reason: failed.reason }
      : { serializable: true, valueKind: "object" };
  }

  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    const typeArguments = checker.getTypeArguments(type as ts.TypeReference);
    const assessments = typeArguments.map((member) => assessType(member, checker, new Set(seen)));
    const failed = assessments.find((assessment) => !assessment.serializable);
    return failed
      ? { serializable: false, valueKind: "array", reason: failed.reason }
      : { serializable: true, valueKind: "array" };
  }

  if (seen.has(type)) {
    return {
      serializable: false,
      valueKind: "unknown",
      reason: "recursive object types require an explicit editor adapter",
    };
  }
  seen.add(type);

  if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) {
    return {
      serializable: false,
      valueKind: "unknown",
      reason: "functions and constructors cannot be serialized",
    };
  }

  if (type.flags & ts.TypeFlags.Object) {
    const symbolName = type.aliasSymbol?.getName() ?? type.getSymbol()?.getName();
    if (symbolName && NON_SERIALIZABLE_OBJECTS.has(symbolName)) {
      return {
        serializable: false,
        valueKind: "unknown",
        reason: `${symbolName} requires a runtime adapter`,
      };
    }

    for (const property of checker.getPropertiesOfType(type)) {
      if (property.flags & (ts.SymbolFlags.Method | ts.SymbolFlags.Function)) {
        return {
          serializable: false,
          valueKind: "object",
          reason: `object member ${property.getName()} is callable`,
        };
      }
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      const propertyType = checker.getTypeOfSymbolAtLocation(
        property,
        declaration ?? type.getSymbol()?.valueDeclaration ?? type.getSymbol()?.declarations?.[0] ?? declarationFallback(type),
      );
      const assessment = assessType(propertyType, checker, new Set(seen));
      if (!assessment.serializable) {
        return {
          serializable: false,
          valueKind: "object",
          reason: `object member ${property.getName()} is unsupported: ${assessment.reason ?? checker.typeToString(propertyType)}`,
        };
      }
    }

    for (const indexKind of [ts.IndexKind.String, ts.IndexKind.Number]) {
      const indexType = checker.getIndexTypeOfType(type, indexKind);
      if (!indexType) continue;
      const assessment = assessType(indexType, checker, new Set(seen));
      if (!assessment.serializable) {
        return {
          serializable: false,
          valueKind: "object",
          reason: assessment.reason,
        };
      }
    }

    return { serializable: true, valueKind: "object" };
  }

  return {
    serializable: false,
    valueKind: "unknown",
    reason: `type ${checker.typeToString(type)} is not supported by the initial catalog schema`,
  };
}

function declarationFallback(type: ts.Type): ts.Node {
  const symbol = type.getSymbol();
  const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
  if (declaration) return declaration;
  throw new Error(`Cannot resolve a declaration for type ${symbol?.getName() ?? "unknown"}.`);
}

function containsUndefined(type: ts.Type): boolean {
  return Boolean(type.flags & ts.TypeFlags.Undefined) ||
    (type.isUnion() && type.types.some((member) => Boolean(member.flags & ts.TypeFlags.Undefined)));
}

function toTypescriptDiagnostic(
  diagnostic: ts.Diagnostic,
  projectRoot: string,
): IndexDiagnostic {
  const sourceFile = diagnostic.file;
  const sourcePath = sourceFile ? toProjectPath(sourceFile.fileName, projectRoot) : undefined;
  const location = sourceFile && diagnostic.start !== undefined
    ? getLocation(sourceFile, diagnostic.start)
    : undefined;
  const code = diagnostic.code === 5083 ? "TSCONFIG_READ_FAILED" : "TYPESCRIPT_DIAGNOSTIC";
  return {
    code,
    severity: diagnostic.category === ts.DiagnosticCategory.Error ? "error" : "warning",
    message: `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
    ...(sourcePath ? { sourcePath } : {}),
    ...(location ? { location } : {}),
  };
}

function getLocation(sourceFile: ts.SourceFile, position: number): SourceLocation {
  const location = sourceFile.getLineAndCharacterOfPosition(position);
  return { line: location.line + 1, column: location.character + 1 };
}

function isInsideProject(fileName: string, projectRoot: string): boolean {
  const relative = path.relative(projectRoot, path.resolve(fileName));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function toProjectPath(fileName: string, projectRoot: string): string {
  return path.relative(projectRoot, path.resolve(fileName)).split(path.sep).join("/");
}
