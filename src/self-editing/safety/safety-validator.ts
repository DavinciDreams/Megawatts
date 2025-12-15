import { Logger } from '../../../utils/logger';
import { BotError } from '../../../types';

/**
 * Comprehensive safety validation for self-editing operations
 */
export class SafetyValidator {
  private logger: Logger;
  private safetyRules: Array<{
    name: string;
    description: string;
    validate: (modification: any) => Promise<{ safe: boolean; reason?: string }>;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }> = [];

  constructor(logger: Logger) {
    this.logger = logger;
    this.initializeSafetyRules();
  }

  /**
   * Validate modification safety
   */
  public async validateSafety(modification: any): Promise<{
    safe: boolean;
    violations: Array<{
      rule: string;
      severity: string;
      reason: string;
    }>;
    warnings: Array<{
      rule: string;
      reason: string;
    }>;
  }> {
    try {
      this.logger.debug('Validating modification safety');
      
      const violations: Array<{
        rule: string;
        severity: string;
        reason: string;
      }> = [];
      
      const warnings: Array<{
        rule: string;
        reason: string;
      }> = [];
      
      // Run all safety rules
      for (const rule of this.safetyRules) {
        try {
          const result = await rule.validate(modification);
          
          if (!result.safe) {
            if (rule.severity === 'critical' || rule.severity === 'high') {
              violations.push({
                rule: rule.name,
                severity: rule.severity,
                reason: result.reason || 'Safety rule violation'
              });
            } else {
              warnings.push({
                rule: rule.name,
                reason: result.reason || 'Safety rule warning'
              });
            }
          }
        } catch (error) {
          this.logger.error(`Safety rule ${rule.name} failed:`, error);
          violations.push({
            rule: rule.name,
            severity: 'high',
            reason: `Rule execution failed: ${error}`
          });
        }
      }
      
      const safe = violations.length === 0;
      
      this.logger.debug(`Safety validation completed: ${safe ? 'safe' : 'unsafe'}`);
      return { safe, violations, warnings };
    } catch (error) {
      this.logger.error('Safety validation failed:', error);
      throw new BotError(`Safety validation failed: ${error}`, 'high');
    }
  }

  /**
   * Initialize safety rules
   */
  private initializeSafetyRules(): void {
    this.safetyRules = [
      {
        name: 'no-system-calls',
        description: 'Prevent direct system calls',
        severity: 'critical' as const,
        validate: async (modification) => {
          const dangerousPatterns = [
            'require(\'child_process\')',
            'require(\'fs\')',
            'process.exit',
            'process.kill',
            'execSync',
            'spawnSync'
          ];
          
          const code = modification.code || '';
          const hasDangerousPattern = dangerousPatterns.some(pattern => 
            code.includes(pattern)
          );
          
          return {
            safe: !hasDangerousPattern,
            reason: hasDangerousPattern ? 'Contains dangerous system calls' : undefined
          };
        }
      },
      
      {
        name: 'no-network-access',
        description: 'Prevent unauthorized network access',
        severity: 'high' as const,
        validate: async (modification) => {
          const networkPatterns = [
            'fetch(',
            'http.request',
            'https.request',
            'socket.connect',
            'net.connect'
          ];
          
          const code = modification.code || '';
          const hasNetworkPattern = networkPatterns.some(pattern => 
            code.includes(pattern)
          );
          
          return {
            safe: !hasNetworkPattern,
            reason: hasNetworkPattern ? 'Contains unauthorized network access' : undefined
          };
        }
      },
      
      {
        name: 'no-file-system-access',
        description: 'Prevent file system access',
        severity: 'high' as const,
        validate: async (modification) => {
          const fsPatterns = [
            'fs.',
            'require(\'fs\')',
            'readFileSync',
            'writeFileSync',
            'unlinkSync',
            'readdirSync'
          ];
          
          const code = modification.code || '';
          const hasFsPattern = fsPatterns.some(pattern => 
            code.includes(pattern)
          );
          
          return {
            safe: !hasFsPattern,
            reason: hasFsPattern ? 'Contains file system access' : undefined
          };
        }
      },
      
      {
        name: 'no-eval-or-function-constructor',
        description: 'Prevent dynamic code execution',
        severity: 'critical' as const,
        validate: async (modification) => {
          const dangerousPatterns = ['eval(', 'Function(', 'new Function'];
          
          const code = modification.code || '';
          const hasDangerousPattern = dangerousPatterns.some(pattern => 
            code.includes(pattern)
          );
          
          return {
            safe: !hasDangerousPattern,
            reason: hasDangerousPattern ? 'Contains dynamic code execution' : undefined
          };
        }
      },
      
      {
        name: 'no-infinite-loops',
        description: 'Prevent potential infinite loops',
        severity: 'medium' as const,
        validate: async (modification) => {
          const loopPatterns = ['while(true)', 'for(;;)', 'while(1)'];
          
          const code = modification.code || '';
          const hasLoopPattern = loopPatterns.some(pattern => 
            code.includes(pattern)
          );
          
          return {
            safe: !hasLoopPattern,
            reason: hasLoopPattern ? 'Contains potential infinite loop' : undefined
          };
        }
      },
      
      {
        name: 'memory-usage-check',
        description: 'Check for memory-intensive operations',
        severity: 'medium' as const,
        validate: async (modification) => {
          const code = modification.code || '';
          const memoryIntensivePatterns = [
            'new Array(',
            'new Buffer(',
            'Array(',
            'fill('
          ];
          
          const hasMemoryIntensive = memoryIntensivePatterns.some(pattern => 
            code.includes(pattern)
          );
          
          return {
            safe: !hasMemoryIntensive,
            reason: hasMemoryIntensive ? 'Contains memory-intensive operations' : undefined
          };
        }
      },
      
      {
        name: 'code-size-limit',
        description: 'Limit code size to prevent bloat',
        severity: 'low' as const,
        validate: async (modification) => {
          const code = modification.code || '';
          const maxSize = 10000; // 10KB limit
          
          const codeSize = code.length;
          const exceedsLimit = codeSize > maxSize;
          
          return {
            safe: !exceedsLimit,
            reason: exceedsLimit ? `Code size ${codeSize} exceeds limit ${maxSize}` : undefined
          };
        }
      }
    ];
  }

  /**
   * Add custom safety rule
   */
  public addSafetyRule(rule: {
    name: string;
    description: string;
    validate: (modification: any) => Promise<{ safe: boolean; reason?: string }>;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }): void {
    this.safetyRules.push(rule);
    this.logger.debug(`Added safety rule: ${rule.name}`);
  }

  /**
   * Remove safety rule
   */
  public removeSafetyRule(name: string): boolean {
    const initialLength = this.safetyRules.length;
    this.safetyRules = this.safetyRules.filter(rule => rule.name !== name);
    const removed = this.safetyRules.length < initialLength;
    
    if (removed) {
      this.logger.debug(`Removed safety rule: ${name}`);
    } else {
      this.logger.warn(`Safety rule not found: ${name}`);
    }
    
    return removed;
  }

  /**
   * Get all safety rules
   */
  public getSafetyRules(): Array<{
    name: string;
    description: string;
    severity: string;
  }> {
    return this.safetyRules.map(rule => ({
      name: rule.name,
      description: rule.description,
      severity: rule.severity
    }));
  }
}