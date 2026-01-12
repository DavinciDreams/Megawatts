import * as ts from 'typescript';
import { Logger } from '../../utils/logger';
import { BotError } from '../../utils/errors';
import { ModificationChange, CodeLocation, ModificationType } from '../../types/self-editing';

/**
 * AST-based code transformation engine
 */
export class ASTTransformer {
  private logger: Logger;
  private sourceFiles: Map<string, ts.SourceFile> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Apply transformation to AST
   */
  public async transform(
    ast: any,
    transformations: Array<{
      type: string;
      target: string;
      parameters: Record<string, any>;
    }>
  ): Promise<{
    transformedAST: any;
    changes: ModificationChange[];
    summary: {
      transformationsApplied: number;
      linesModified: number;
      functionsModified: number;
      classesModified: number;
    };
  }> {
    try {
      this.logger.debug(`Applying ${transformations.length} transformations`);
      
      let transformedAST = JSON.parse(JSON.stringify(ast));
      const changes: ModificationChange[] = [];
      let linesModified = 0;
      let functionsModified = 0;
      let classesModified = 0;

      // Apply each transformation
      for (const transformation of transformations) {
        const result = await this.applyTransformation(transformedAST, transformation);
        transformedAST = result.transformedAST;
        changes.push(...result.changes);
        
        linesModified += result.linesModified;
        if (result.functionsModified) functionsModified += result.functionsModified;
        if (result.classesModified) classesModified += result.classesModified;
      }

      const summary = {
        transformationsApplied: transformations.length,
        linesModified,
        functionsModified,
        classesModified
      };

      this.logger.debug(`Transformations applied successfully`);
      
      return {
        transformedAST,
        changes,
        summary
      };
    } catch (error) {
      this.logger.error('AST transformation failed:', error instanceof Error ? error : undefined);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BotError(`AST transformation failed: ${errorMessage}`);
    }
  }

  /**
   * Apply single transformation
   */
  private async applyTransformation(
    ast: any,
    transformation: {
      type: string;
      target: string;
      parameters: Record<string, any>;
    }
  ): Promise<{
    transformedAST: any;
    changes: ModificationChange[];
    linesModified: number;
    functionsModified: number;
    classesModified: number;
  }> {
    switch (transformation.type) {
      case 'rename':
        return this.renameNode(ast, transformation.target, transformation.parameters.newName);
      case 'extract':
        return this.extractFunction(ast, transformation.target, transformation.parameters.functionName);
      case 'inline':
        return this.inlineFunction(ast, transformation.target);
      case 'optimize':
        return this.optimizeNode(ast, transformation.target, transformation.parameters.optimizations);
      case 'refactor':
        return this.refactorNode(ast, transformation.target, transformation.parameters.strategy);
      default:
        throw new BotError(`Unknown transformation type: ${transformation.type}`);
    }
  }

  /**
   * Rename a node in AST
   */
  private async renameNode(
    ast: any,
    target: string,
    newName: string
  ): Promise<{
    transformedAST: any;
    changes: ModificationChange[];
    linesModified: number;
    functionsModified: number;
    classesModified: number;
  }> {
    const node = this.findNode(ast, target);
    
    if (!node) {
      throw new BotError(`Target node ${target} not found`);
    }

    const oldName = node.name || node.id?.name || target;
    const changes: ModificationChange[] = [{
      id: this.generateId(),
      type: ModificationType.MODIFY,
      file: this.getNodeFile(node),
      location: this.getNodeLocation(node),
      originalCode: this.getNodeCode(node),
      newCode: this.getNodeCode(node).replace(oldName, newName),
      description: `Rename ${oldName} to ${newName}`,
      reason: 'Renaming identifier',
      risk: 'low'
    }];

    // Update node name
    if (node.name) {
      node.name = newName;
    } else if (node.id && node.id.name) {
      node.id.name = newName;
    }

    return Promise.resolve({
      transformedAST: ast,
      changes,
      linesModified: 1,
      functionsModified: this.isFunctionNode(node) ? 1 : 0,
      classesModified: this.isClassNode(node) ? 1 : 0
    });
  }

  /**
   * Extract function from AST
   */
  private extractFunction(
    ast: any,
    target: string,
    functionName: string
  ): Promise<{
    transformedAST: any;
    changes: ModificationChange[];
    linesModified: number;
    functionsModified: number;
    classesModified: number;
  }> {
    const targetNode = this.findNode(ast, target);
    
    if (!targetNode) {
      throw new BotError(`Target node ${target} not found`);
    }

    const functionNode = this.findFunctionNode(targetNode);
    
    if (!functionNode) {
      throw new BotError(`Function not found in target ${target}`);
    }

    // Extract function code
    const functionCode = this.getNodeCode(functionNode);
    const newFunctionCode = this.extractFunctionBody(functionNode, functionName);

    const changes: ModificationChange[] = [{
      id: this.generateId(),
      type: ModificationType.ADD,
      file: this.getNodeFile(targetNode),
      location: this.getNodeLocation(targetNode),
      newCode: newFunctionCode,
      description: `Extract function ${functionName}`,
      reason: 'Extracting reusable code',
      risk: 'medium'
    }];

    // Add new function to AST
    const newFunction = {
      type: 'FunctionDeclaration',
      name: functionName,
      params: functionNode.params,
      body: newFunctionCode
    };

    // Insert new function after target
    const targetIndex = ast.body.indexOf(targetNode);
    if (targetIndex >= 0) {
      ast.body.splice(targetIndex + 1, 0, newFunction);
    }

    return Promise.resolve({
      transformedAST: ast,
      changes,
      linesModified: 1,
      functionsModified: 1,
      classesModified: 0
    });
  }

  /**
   * Inline a function
   */
  private async inlineFunction(
    ast: any,
    target: string
  ): Promise<{
    transformedAST: any;
    changes: ModificationChange[];
    linesModified: number;
    functionsModified: number;
    classesModified: number;
  }> {
    const targetNode = this.findNode(ast, target);
    
    if (!targetNode || !this.isFunctionNode(targetNode)) {
      throw new BotError(`Target function ${target} not found`);
    }

    const functionCode = this.getNodeCode(targetNode);
    const inlinedCode = this.inlineFunctionCalls(functionCode, targetNode);

    const changes: ModificationChange[] = [{
      id: this.generateId(),
      type: ModificationType.MODIFY,
      file: this.getNodeFile(targetNode),
      location: this.getNodeLocation(targetNode),
      originalCode: functionCode,
      newCode: inlinedCode,
      description: `Inline function calls in ${target}`,
      reason: 'Inlining function for performance',
      risk: 'medium'
    }];

    // Update function with inlined code
    targetNode.body = this.parseCode(inlinedCode);

    return Promise.resolve({
      transformedAST: ast,
      changes,
      linesModified: 1,
      functionsModified: 1,
      classesModified: 0
    });
  }

  /**
   * Optimize a node
   */
  private async optimizeNode(
    ast: any,
    target: string,
    optimizations: string[]
  ): Promise<{
    transformedAST: any;
    changes: ModificationChange[];
    linesModified: number;
    functionsModified: number;
    classesModified: number;
  }> {
    const targetNode = this.findNode(ast, target);
    
    if (!targetNode) {
      throw new BotError(`Target node ${target} not found`);
    }

    const nodeCode = this.getNodeCode(targetNode);
    const optimizedCode = this.applyOptimizations(nodeCode, optimizations);

    const changes: ModificationChange[] = [{
      id: this.generateId(),
      type: ModificationType.OPTIMIZE,
      file: this.getNodeFile(targetNode),
      location: this.getNodeLocation(targetNode),
      originalCode: nodeCode,
      newCode: optimizedCode,
      description: `Optimize ${target} with ${optimizations.length} optimizations`,
      reason: 'Code optimization',
      risk: 'low'
    }];

    targetNode.body = this.parseCode(optimizedCode);

    return Promise.resolve({
      transformedAST: ast,
      changes,
      linesModified: 1,
      functionsModified: this.isFunctionNode(targetNode) ? 1 : 0,
      classesModified: this.isClassNode(targetNode) ? 1 : 0
    });
  }

  /**
   * Refactor a node
   */
  private async refactorNode(
    ast: any,
    target: string,
    strategy: string
  ): Promise<{
    transformedAST: any;
    changes: ModificationChange[];
    linesModified: number;
    functionsModified: number;
    classesModified: number;
  }> {
    const targetNode = this.findNode(ast, target);
    
    if (!targetNode) {
      throw new BotError(`Target node ${target} not found`);
    }

    const nodeCode = this.getNodeCode(targetNode);
    const refactoredCode = this.applyRefactoringStrategy(nodeCode, strategy);

    const changes: ModificationChange[] = [{
      id: this.generateId(),
      type: ModificationType.REFACTOR,
      file: this.getNodeFile(targetNode),
      location: this.getNodeLocation(targetNode),
      originalCode: nodeCode,
      newCode: refactoredCode,
      description: `Refactor ${target} using ${strategy} strategy`,
      reason: `Refactoring using ${strategy} strategy`,
      risk: 'medium'
    }];

    targetNode.body = this.parseCode(refactoredCode);

    return Promise.resolve({
      transformedAST: ast,
      changes,
      linesModified: 1,
      functionsModified: this.isFunctionNode(targetNode) ? 1 : 0,
      classesModified: this.isClassNode(targetNode) ? 1 : 0
    });
  }

  /**
   * Find node by target identifier
   * Performs actual AST traversal to locate nodes by name, id, or path
   */
  private findNode(ast: any, target: string): any {
    if (!ast) {
      return null;
    }

    // Handle target as a path (e.g., "file.ts:ClassName.method")
    if (target.includes(':')) {
      const [filePath, identifier] = target.split(':');
      const sourceFile = this.sourceFiles.get(filePath);
      if (sourceFile) {
        return this.findNodeInSourceFile(sourceFile, identifier);
      }
    }

    // Check if current node matches
    if (this.nodeMatches(ast, target)) {
      return ast;
    }

    // Traverse body if exists
    if (ast.body && Array.isArray(ast.body)) {
      for (const child of ast.body) {
        const found = this.findNode(child, target);
        if (found) {
          return found;
        }
      }
    }

    // Traverse children using TypeScript AST structure
    return this.traverseAST(ast, target);
  }

  /**
   * Helper to traverse TypeScript AST and find node by identifier
   */
  private traverseAST(node: any, target: string): any {
    if (!node || typeof node !== 'object') {
      return null;
    }

    // Check if current node matches
    if (this.nodeMatches(node, target)) {
      return node;
    }

    // Recursively check all properties
    for (const key in node) {
      if (key === 'parent' || key === 'flags' || key === 'modifierFlagsCache') {
        continue;
      }
      
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          const found = this.traverseAST(item, target);
          if (found) return found;
        }
      } else if (child && typeof child === 'object') {
        const found = this.traverseAST(child, target);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Check if a node matches target identifier
   */
  private nodeMatches(node: any, target: string): boolean {
    if (!node) {
      return false;
    }

    // Check by name property
    if (node.name) {
      if (typeof node.name === 'string' && node.name === target) {
        return true;
      }
      if (node.name.name && node.name.name === target) {
        return true;
      }
    }

    // Check by id property
    if (node.id && node.id.name === target) {
      return true;
    }

    // Check by declaration name
    if (node.declarationName && node.declarationName === target) {
      return true;
    }

    return false;
  }

  /**
   * Find node in a specific source file
   */
  private findNodeInSourceFile(sourceFile: ts.SourceFile, identifier: string): any {
    let result: any = null;

    const visit = (node: ts.Node) => {
      if (result) return; // Already found

      if (ts.isFunctionDeclaration(node) && node.name?.getText() === identifier) {
        result = node;
        return;
      }

      if (ts.isClassDeclaration(node) && node.name?.getText() === identifier) {
        result = node;
        return;
      }

      if (ts.isVariableStatement(node)) {
        const declarations = node.declarationList.declarations;
        for (const decl of declarations) {
          if (decl.name.getText() === identifier) {
            result = node;
            return;
          }
        }
      }

      if (ts.isMethodDeclaration(node) && node.name?.getText() === identifier) {
        result = node;
        return;
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return result;
  }

  /**
   * Find function node within a given node
   * Returns first function declaration found in subtree
   */
  private findFunctionNode(node: any): any {
    if (!node) {
      return null;
    }

    // Check if current node is a function
    if (this.isFunctionNode(node)) {
      return node;
    }

    // Check body for function
    if (node.body) {
      if (this.isFunctionNode(node.body)) {
        return node.body;
      }
      const found = this.findFunctionNode(node.body);
      if (found) return found;
    }

    // Check array body
    if (node.body && Array.isArray(node.body)) {
      for (const child of node.body) {
        const found = this.findFunctionNode(child);
        if (found) return found;
      }
    }

    // Traverse children
    return this.traverseForFunction(node);
  }

  /**
   * Traverse AST to find function nodes
   */
  private traverseForFunction(node: any): any {
    if (!node || typeof node !== 'object') {
      return null;
    }

    if (this.isFunctionNode(node)) {
      return node;
    }

    for (const key in node) {
      if (key === 'parent' || key === 'flags') continue;
      
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          const found = this.traverseForFunction(item);
          if (found) return found;
        }
      } else if (child && typeof child === 'object') {
        const found = this.traverseForFunction(child);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Check if node is a function
   */
  private isFunctionNode(node: any): boolean {
    if (!node || !node.type) {
      return false;
    }
    return [
      'FunctionDeclaration',
      'FunctionExpression',
      'ArrowFunctionExpression',
      'MethodDefinition',
      'MethodDeclaration'
    ].includes(node.type);
  }

  /**
   * Check if node is a class
   */
  private isClassNode(node: any): boolean {
    if (!node || !node.type) {
      return false;
    }
    return [
      'ClassDeclaration',
      'ClassExpression'
    ].includes(node.type);
  }

  /**
   * Get node file location
   * Extracts file path from AST node metadata
   */
  private getNodeFile(node: any): string {
    if (!node) {
      return 'unknown.ts';
    }

    // Check for loc property (ESTree format)
    if (node.loc && node.loc.source) {
      return node.loc.source;
    }

    // Check for sourceFile property (TypeScript format)
    if (node.sourceFile) {
      return node.sourceFile.fileName;
    }

    // Check for file property
    if (node.file) {
      return node.file;
    }

    // Check parent chain
    let current = node;
    while (current) {
      if (current.sourceFile) {
        return current.sourceFile.fileName;
      }
      if (current.loc && current.loc.source) {
        return current.loc.source;
      }
      current = current.parent;
    }

    return 'unknown.ts';
  }

  /**
   * Get node location (line and column)
   * Extracts position information from AST node
   */
  private getNodeLocation(node: any): CodeLocation {
    if (!node) {
      return {
        file: 'unknown.ts',
        line: 1,
        column: 1
      };
    }

    let line = 1;
    let column = 1;
    let functionName: string | undefined;
    let className: string | undefined;

    // Extract from loc property (ESTree format)
    if (node.loc) {
      line = node.loc.start?.line || 1;
      column = node.loc.start?.column || 1;
    }

    // Extract from pos property (TypeScript format)
    if (node.pos !== undefined && node.end !== undefined) {
      const sourceFile = this.getSourceFileForNode(node);
      if (sourceFile) {
        const { line: tsLine, character: tsColumn } = sourceFile.getLineAndCharacterOfPosition(node.pos);
        line = tsLine + 1; // TypeScript uses 0-based line numbers
        column = tsColumn;
      }
    }

    // Extract function name
    if (node.name) {
      functionName = typeof node.name === 'string' ? node.name : node.name.name;
    }

    // Extract class name for methods
    if (this.isClassNode(node) && node.name) {
      className = typeof node.name === 'string' ? node.name : node.name.name;
    }

    return {
      file: this.getNodeFile(node),
      line,
      column,
      function: functionName,
      class: className
    };
  }

  /**
   * Get source file for a node
   */
  private getSourceFileForNode(node: any): ts.SourceFile | null {
    if (!node) return null;

    if (ts.isSourceFile(node)) {
      return node;
    }

    if (node.sourceFile) {
      return node.sourceFile;
    }

    let current = node;
    while (current) {
      if (current.sourceFile) {
        return current.sourceFile;
      }
      current = current.parent;
    }

    return null;
  }

  /**
   * Get node code
   * Extracts actual source code for a node using source mapping
   */
  private getNodeCode(node: any): string {
    if (!node) {
      return '';
    }

    // If node has explicit code property
    if (node.code) {
      return node.code;
    }

    // Get source file and extract code range
    const sourceFile = this.getSourceFileForNode(node);
    if (sourceFile && node.pos !== undefined && node.end !== undefined) {
      return sourceFile.text.substring(node.pos, node.end);
    }

    // Fallback: try to reconstruct from AST structure
    return this.reconstructCodeFromNode(node);
  }

  /**
   * Reconstruct code from AST node structure
   * This is a fallback when source file is not available
   */
  private reconstructCodeFromNode(node: any): string {
    if (!node) return '';

    const type = node.type || 'Unknown';
    const name = node.name ? (typeof node.name === 'string' ? node.name : node.name.name) : '';

    switch (type) {
      case 'FunctionDeclaration':
      case 'FunctionExpression':
        const params = node.params?.map((p: any) => 
          typeof p === 'string' ? p : (p.name || '')
        ).join(', ') || '';
        return `function ${name}(${params}) { /* body */ }`;
      
      case 'ArrowFunctionExpression':
        return `(${node.params?.map((p: any) => p.name || '').join(', ') || ''}) => { /* body */ }`;
      
      case 'ClassDeclaration':
        return `class ${name} { /* body */ }`;
      
      case 'MethodDeclaration':
        return `${name}() { /* body */ }`;
      
      case 'VariableDeclaration':
        return `const ${name} = /* value */;`;
      
      case 'Identifier':
        return name;
      
      default:
        return `/* ${type} node */`;
    }
  }

  /**
   * Parse code to AST
   * Implements actual TypeScript/JavaScript parsing using TypeScript compiler API
   */
  private parseCode(code: string, fileName: string = 'temp.ts'): any {
    try {
      const compilerOptions: ts.CompilerOptions = {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        jsx: ts.JsxEmit.Preserve
      };

      const sourceFile = ts.createSourceFile(
        fileName,
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
      );

      // Store source file for later reference
      this.sourceFiles.set(fileName, sourceFile);

      // Return parsed AST
      return {
        type: 'Program',
        body: sourceFile.statements,
        sourceFile,
        sourceType: 'module',
        start: 0,
        end: code.length,
        loc: {
          start: { line: 1, column: 0 },
          end: { line: code.split('\n').length, column: 0 }
        }
      };
    } catch (error) {
      this.logger.error(`Failed to parse code:`, error instanceof Error ? error : undefined);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BotError(`Code parsing failed: ${errorMessage}`);
    }
  }

  /**
   * Extract function body
   * Extracts and formats the body of a function node
   */
  private extractFunctionBody(node: any, functionName: string): string {
    if (!node) {
      return '';
    }

    let params = '';
    let body = '';

    // Extract parameters
    if (node.params && Array.isArray(node.params)) {
      params = node.params.map((p: any) => {
        if (typeof p === 'string') return p;
        return p.name || '';
      }).join(', ');
    }

    // Extract body
    if (node.body) {
      if (typeof node.body === 'string') {
        body = node.body;
      } else if (node.body.type === 'BlockStatement' && node.body.body) {
        body = node.body.body.map((stmt: any) => {
          if (typeof stmt === 'string') return stmt;
          return this.reconstructCodeFromNode(stmt);
        }).join('\n  ');
      } else {
        body = this.reconstructCodeFromNode(node.body);
      }
    }

    // Format as function declaration
    return `function ${functionName}(${params}) {\n  ${body}\n}`;
  }

  /**
   * Inline function calls
   * Replaces function calls with their actual implementations
   */
  private inlineFunctionCalls(code: string, targetNode: any): string {
    if (!targetNode || !code) {
      return code;
    }

    const functionName = targetNode.name || (targetNode.id?.name);
    if (!functionName) {
      return code;
    }

    // Get function body to inline
    const functionBody = this.extractFunctionBody(targetNode, functionName);
    
    // Extract just the body content (without function declaration wrapper)
    const bodyMatch = functionBody.match(/\{([\s\S]*)\}/);
    const bodyContent = bodyMatch ? bodyMatch[1].trim() : '';

    // Replace function calls with inlined body
    // This is a simple implementation; a full implementation would need to handle:
    // - Parameter substitution
    // - Return statement handling
    // - Variable scope management
    // - Multiple return paths
    
    const callPattern = new RegExp(
      `${functionName}\\s*\\(([^)]*)\\)`,
      'g'
    );

    return code.replace(callPattern, (match, args) => {
      // Simple parameter substitution
      const argList = args.split(',').map((a: string) => a.trim());
      let inlinedBody = bodyContent;

      // Replace parameter references with actual arguments
      if (targetNode.params && Array.isArray(targetNode.params)) {
        targetNode.params.forEach((param: any, index: number) => {
          const paramName = typeof param === 'string' ? param : (param.name || '');
          if (paramName && argList[index] !== undefined) {
            inlinedBody = inlinedBody.replace(new RegExp(`\\b${paramName}\\b`, 'g'), argList[index]);
          }
        });
      }

      return `{\n    ${inlinedBody}\n  }`;
    });
  }

  /**
   * Apply optimizations
   * Applies a series of code optimizations
   */
  private applyOptimizations(code: string, optimizations: string[]): string {
    let optimizedCode = code;

    for (const optimization of optimizations) {
      switch (optimization) {
        case 'remove-unused-variables':
          optimizedCode = this.removeUnusedVariables(optimizedCode);
          break;
        case 'simplify-conditionals':
          optimizedCode = this.simplifyConditionals(optimizedCode);
          break;
        case 'reduce-nesting':
          optimizedCode = this.reduceNesting(optimizedCode);
          break;
        case 'constant-folding':
          optimizedCode = this.constantFolding(optimizedCode);
          break;
        case 'dead-code-elimination':
          optimizedCode = this.deadCodeElimination(optimizedCode);
          break;
        default:
          this.logger.warn(`Unknown optimization: ${optimization}`);
      }
    }

    return optimizedCode;
  }

  /**
   * Remove unused variables
   * Analyzes code to identify and remove variables that are never used
   */
  private removeUnusedVariables(code: string): string {
    try {
      const sourceFile = ts.createSourceFile(
        'temp.ts',
        code,
        ts.ScriptTarget.Latest,
        true
      );

      const usedVariables = new Set<string>();
      const declaredVariables = new Set<string>();

      // First pass: collect variable declarations
      const collectDeclarations = (node: ts.Node) => {
        if (ts.isVariableDeclaration(node) && node.name) {
          const name = node.name.getText();
          declaredVariables.add(name);
        }
        ts.forEachChild(node, collectDeclarations);
      };

      // Second pass: collect variable usages
      const collectUsages = (node: ts.Node) => {
        if (ts.isIdentifier(node)) {
          const name = node.getText();
          usedVariables.add(name);
        }
        ts.forEachChild(node, collectUsages);
      };

      collectDeclarations(sourceFile);
      collectUsages(sourceFile);

      // Find unused variables
      const unusedVariables = Array.from(declaredVariables).filter(
        v => !usedVariables.has(v)
      );

      let result = code;
      for (const variable of unusedVariables) {
        // Remove variable declarations
        const pattern = new RegExp(
          `(?:let|const|var)\\s+${this.escapeRegex(variable)}\\s*(?:=[^;]+)?;?\\s*\\n?`,
          'g'
        );
        result = result.replace(pattern, '');
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to remove unused variables:`, error instanceof Error ? error : undefined);
      return code;
    }
  }

  /**
   * Simplify conditionals
   * Simplifies complex conditional expressions
   */
  private simplifyConditionals(code: string): string {
    let result = code;

    // Simplify if (condition) return value; return other;
    result = result.replace(
      /if\s*\(\s*([^)]+)\s*\)\s*\{\s*return\s+([^;{}]+)\s*;?\s*\}\s*return\s+([^;{}]+)\s*;?/g,
      'return $1 ? $2 : $3;'
    );

    // Simplify if (condition) return true; return false;
    result = result.replace(
      /if\s*\(\s*([^)]+)\s*\)\s*\{\s*return\s+true\s*;?\s*\}\s*return\s+false\s*;?/g,
      'return $1;'
    );

    // Simplify if (condition) return false; return true;
    result = result.replace(
      /if\s*\(\s*([^)]+)\s*\)\s*\{\s*return\s+false\s*;?\s*\}\s*return\s+true\s*;?/g,
      'return !$1;'
    );

    // Simplify double negation
    result = result.replace(/!!\s*(\w+)/g, '$1');

    // Simplify if (true) ... else ...
    result = result.replace(/if\s*\(\s*true\s*\)\s*\{([^}]*)\}\s*else\s*\{[^}]*\}/g, '{$1}');

    // Simplify if (false) ... else ...
    result = result.replace(/if\s*\(\s*false\s*\)\s*\{[^}]*\}\s*else\s*\{([^}]*)\}/g, '{$1}');

    return result;
  }

  /**
   * Reduce nesting
   * Reduces code nesting through guard clauses and early returns
   */
  private reduceNesting(code: string): string {
    let result = code;

    // Convert nested if-else to guard clauses
    // if (condition) { if (other) { code } }
    // becomes: if (!condition) return; if (!other) return; code
    
    const reduceNestedIfs = (match: string, condition1: string, condition2: string, body: string) => {
      return `if (!(${condition1})) return;\n  if (!(${condition2})) return;\n  ${body}`;
    };

    result = result.replace(
      /if\s*\(\s*([^)]+)\s*\)\s*\{\s*if\s*\(\s*([^)]+)\s*\)\s*\{([^}]*)\}\s*\}/g,
      reduceNestedIfs
    );

    // Convert nested loops to guard clauses where possible
    result = result.replace(/\{\s*\{\s*\{/g, '{');
    result = result.replace(/\}\s*\}\s*\}/g, '}');

    return result;
  }

  /**
   * Constant folding
   * Evaluates constant expressions at compile time
   */
  private constantFolding(code: string): string {
    let result = code;

    // Fold numeric constants: 1 + 2 -> 3
    result = result.replace(/\b(\d+)\s*\+\s*(\d+)\b/g, (match, a, b) => {
      return String(Number(a) + Number(b));
    });

    result = result.replace(/\b(\d+)\s*\*\s*(\d+)\b/g, (match, a, b) => {
      return String(Number(a) * Number(b));
    });

    // Fold string concatenation: "a" + "b" -> "ab"
    result = result.replace(/"([^"]*)"\s*\+\s*"([^"]*)"/g, (match, a, b) => {
      return `"${a}${b}"`;
    });

    result = result.replace(/'([^']*)'\s*\+\s*'([^']*)'/g, (match, a, b) => {
      return `'${a}${b}'`;
    });

    return result;
  }

  /**
   * Dead code elimination
   * Removes code that will never be executed
   */
  private deadCodeElimination(code: string): string {
    let result = code;

    // Remove unreachable code after return
    result = result.replace(
      /return\s+[^;{}]+;?\s*[\s\S]*?(?=\n\s*(?:function|class|const|let|var|if|for|while|$))/gm,
      (match) => {
        const returnMatch = match.match(/return\s+[^;{}]+;?/);
        return returnMatch ? returnMatch[0] : match;
      }
    );

    // Remove code after throw
    result = result.replace(
      /throw\s+[^;{}]+;?\s*[\s\S]*?(?=\n\s*(?:function|class|const|let|var|if|for|while|$))/gm,
      (match) => {
        const throwMatch = match.match(/throw\s+[^;{}]+;?/);
        return throwMatch ? throwMatch[0] : match;
      }
    );

    // Remove empty blocks
    result = result.replace(/\{\s*\}/g, '{}');

    return result;
  }

  /**
   * Apply refactoring strategy
   * Applies a specific refactoring pattern to code
   */
  private applyRefactoringStrategy(code: string, strategy: string): string {
    switch (strategy) {
      case 'extract-method':
        return this.extractMethod(code);
      case 'split-function':
        return this.splitFunction(code);
      case 'rename-variables':
        return this.renameVariables(code);
      case 'convert-arrow-to-function':
        return this.convertArrowToFunction(code);
      case 'convert-function-to-arrow':
        return this.convertFunctionToArrow(code);
      case 'destructure-parameters':
        return this.destructureParameters(code);
      default:
        this.logger.warn(`Unknown refactoring strategy: ${strategy}`);
        return code;
    }
  }

  /**
   * Extract method
   * Identifies reusable code blocks and extracts them as separate methods
   */
  private extractMethod(code: string): string {
    // Find repeated patterns (simple heuristic)
    const lines = code.split('\n');
    const patternCounts = new Map<string, number>();

    // Count line patterns
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 10 && !trimmed.startsWith('//')) {
        patternCounts.set(trimmed, (patternCounts.get(trimmed) || 0) + 1);
      }
    }

    // Find patterns that appear more than once
    const repeatedPatterns = Array.from(patternCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([pattern, _]) => pattern);

    if (repeatedPatterns.length === 0) {
      return code;
    }

    // For demonstration, we'll extract the first repeated pattern
    const patternToExtract = repeatedPatterns[0];
    const methodName = `extracted${patternToExtract.substring(0, 10).replace(/[^a-zA-Z0-9]/g, '')}`;

    // Create extracted method
    const extractedMethod = `\n\nfunction ${methodName}() {\n  ${patternToExtract}\n}`;

    // Replace occurrences with method calls
    let result = code.replace(
      new RegExp(this.escapeRegex(patternToExtract), 'g'),
      `${methodName}();`
    );

    // Add method at the end
    result += extractedMethod;

    return result;
  }

  /**
   * Split function
   * Splits a large function into smaller, focused functions
   */
  private splitFunction(code: string): string {
    // Identify logical sections in function
    // This is a simplified implementation
    
    const lines = code.split('\n');
    const sections: string[][] = [];
    let currentSection: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Start new section on blank lines or major control structures
      if (trimmed === '' || trimmed.startsWith('//') || 
          trimmed.startsWith('if') || trimmed.startsWith('for') || 
          trimmed.startsWith('while') || trimmed.startsWith('switch')) {
        if (currentSection.length > 0) {
          sections.push([...currentSection]);
          currentSection = [];
        }
      }
      
      currentSection.push(line);
    }

    if (currentSection.length > 0) {
      sections.push(currentSection);
    }

    // If function is small, return as is
    if (sections.length <= 2) {
      return code;
    }

    // Create helper functions for sections
    const helperFunctions: string[] = [];
    const mainBody: string[] = [];

    sections.forEach((section, index) => {
      if (index === 0) {
        // First section is main function signature
        mainBody.push(...section);
      } else if (index === sections.length - 1) {
        // Last section is return
        mainBody.push(...section);
      } else {
        // Middle sections become helper functions
        const helperName = `section${index}`;
        const helperCode = section.map(l => '  ' + l).join('\n');
        helperFunctions.push(`\nfunction ${helperName}() {\n${helperCode}\n}`);
        mainBody.push(`  ${helperName}();`);
      }
    });

    // Combine everything
    let result = mainBody.join('\n');
    result += '\n\n' + helperFunctions.join('\n');

    return result;
  }

  /**
   * Rename variables
   * Improves variable names to be more descriptive
   */
  private renameVariables(code: string): string {
    let result = code;

    // Common short variable name replacements
    const replacements: Record<string, string> = {
      'a': 'array',
      'i': 'index',
      'j': 'jIndex',
      'k': 'kIndex',
      'n': 'count',
      'x': 'xValue',
      'y': 'yValue',
      'd': 'data',
      'o': 'obj',
      'e': 'error',
      'r': 'result',
      'v': 'value',
      's': 'str',
      'b': 'bool',
      'f': 'func'
    };

    // Only replace single-letter variable declarations
    for (const [oldName, newName] of Object.entries(replacements)) {
      const pattern = new RegExp(
        `(?:let|const|var)\\s+${oldName}\\s*=`,
        'g'
      );
      result = result.replace(pattern, (match) => {
        return match.replace(oldName, newName);
      });
    }

    return result;
  }

  /**
   * Convert arrow functions to regular functions
   */
  private convertArrowToFunction(code: string): string {
    let result = code;

    // Convert simple arrow functions: const f = (x) => x + 1
    result = result.replace(
      /(?:const|let|var)\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>\s*([^{\n;]+)/g,
      'function $1($2) { return $3; }'
    );

    // Convert arrow functions with blocks: const f = (x) => { return x + 1; }
    result = result.replace(
      /(?:const|let|var)\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>\s*\{/g,
      'function $1($2) {'
    );

    return result;
  }

  /**
   * Convert regular functions to arrow functions
   */
  private convertFunctionToArrow(code: string): string {
    let result = code;

    // Convert function expressions: const f = function(x) { return x + 1; }
    result = result.replace(
      /(?:const|let|var)\s+(\w+)\s*=\s*function\s*\(([^)]*)\)\s*\{/g,
      'const $1 = ($2) => {'
    );

    // Convert simple return functions: function f(x) { return x + 1; }
    result = result.replace(
      /function\s+(\w+)\s*\(([^)]*)\)\s*\{\s*return\s+([^;{}]+)\s*;\s*\}/g,
      'const $1 = ($2) => $3'
    );

    return result;
  }

  /**
   * Destructure function parameters
   */
  private destructureParameters(code: string): string {
    let result = code;

    // Convert: function f(obj) { return obj.a + obj.b; }
    // To: function f({ a, b }) { return a + b; }
    
    const destructuringPattern = /function\s+(\w+)\s*\((\w+)\s*\{([^}]*)\}/g;
    
    result = result.replace(destructuringPattern, (match, funcName, paramName, body) => {
      // Find property accesses on the parameter
      const propertyPattern = new RegExp(`\\b${paramName}\\.([a-zA-Z_$][a-zA-Z0-9_$]*)`, 'g');
      const properties = new Set<string>();
      let matchResult;
      
      while ((matchResult = propertyPattern.exec(body)) !== null) {
        properties.add(matchResult[1]);
      }

      if (properties.size < 2) {
        return match; // Not worth destructuring
      }

      const destructuredParams = `{ ${Array.from(properties).join(', ')} }`;
      const newBody = body.replace(new RegExp(`\\b${paramName}\\.`, 'g'), '');

      return `function ${funcName}(${destructuredParams}) {${newBody}}`;
    });

    return result;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private generateId(): string {
    return `transform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
