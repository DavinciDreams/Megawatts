import { Logger } from '../../utils/logger';
import { BotError } from '../../utils/errors';
import { SecurityVulnerability, SensitiveData, SecurityMetrics } from '../../types/self-editing';

interface AntiPattern {
  pattern: RegExp;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

/**
 * Security analysis for code vulnerabilities and threats
 */
export class SecurityAnalyzer {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Analyze code for security vulnerabilities
   */
  public async analyzeSecurity(code: string, filePath: string): Promise<{
    vulnerabilities: SecurityVulnerability[];
    riskScore: number;
    complianceScore: number;
    sensitiveData: SensitiveData[];
  }> {
    try {
      this.logger.debug(`Analyzing security for ${filePath}`);
      
      // Mock security analysis
      const vulnerabilities = await this.scanVulnerabilities(code, filePath);
      const riskScore = this.calculateRiskScore(vulnerabilities);
      const complianceScore = await this.checkCompliance(code);
      const sensitiveData = this.scanSensitiveData(code, filePath);

      this.logger.debug(`Security analysis completed for ${filePath}`);
      
      return {
        vulnerabilities,
        riskScore,
        complianceScore,
        sensitiveData
      };
    } catch (error) {
      this.logger.error(`Security analysis failed for ${filePath}:`, error);
      throw new BotError(`Security analysis failed: ${error}`, 'medium');
    }
  }

  /**
   * Scan for known vulnerabilities
   */
  private async scanVulnerabilities(code: string, filePath: string): Promise<SecurityVulnerability[]> {
    // Mock vulnerability scanning
    return [
      {
        id: 'vuln_001',
        severity: 'high',
        type: 'SQL Injection',
        description: 'Potential SQL injection vulnerability in database query',
        location: {
          file: filePath,
          line: 45,
          column: 12,
          function: 'executeQuery'
        },
        recommendation: 'Use parameterized queries or prepared statements',
        cve: 'CVE-2023-1234'
      },
      {
        id: 'vuln_002',
        severity: 'medium',
        type: 'XSS',
        description: 'Cross-site scripting vulnerability in user input rendering',
        location: {
          file: filePath,
          line: 78,
          column: 15,
          function: 'renderUserContent'
        },
        recommendation: 'Sanitize user input and use content security policy',
        cve: 'CVE-2023-5678'
      },
      {
        id: 'vuln_003',
        severity: 'low',
        type: 'Hardcoded Credentials',
        description: 'Hardcoded API key found in source code',
        location: {
          file: filePath,
          line: 10,
          column: 20
        },
        recommendation: 'Move credentials to environment variables or secure storage',
        cve: 'CVE-2023-9012'
      }
    ];
  }

  /**
   * Calculate overall risk score
   */
  private calculateRiskScore(vulnerabilities: SecurityVulnerability[]): number {
    if (vulnerabilities.length === 0) {
      return 0;
    }

    const severityWeights = {
      critical: 10,
      high: 7,
      medium: 4,
      low: 1
    };

    const totalScore = vulnerabilities.reduce((sum, vuln) => {
      return sum + (severityWeights[vuln.severity] || 0);
    }, 0);

    // Normalize to 0-10 scale
    return Math.min(10, totalScore / vulnerabilities.length);
  }

  /**
   * Check compliance with security standards
   */
  private async checkCompliance(code: string): Promise<number> {
    // Mock compliance checking
    let complianceScore = 100;

    // Check for secure coding practices
    if (!code.includes('https://')) {
      complianceScore -= 5; // No hardcoded URLs
    }

    if (code.includes('password') || code.includes('secret')) {
      complianceScore -= 15; // No hardcoded secrets
    }

    if (code.includes('eval(') || code.includes('Function(')) {
      complianceScore -= 10; // No dynamic code execution
    }

    return Math.max(0, complianceScore);
  }

  /**
   * Scan for sensitive data exposure
   */
  private scanSensitiveData(code: string, filePath: string): SensitiveData[] {
    const sensitivePatterns = [
      { pattern: /api[_-]?key[_-]?=\s*['"][^'"]+['"]/, type: 'API Key', risk: 'high' },
      { pattern: /password[_-]?=\s*['"][^'"]+['"]/, type: 'Password', risk: 'high' },
      { pattern: /secret[_-]?=\s*['"][^'"]+['"]/, type: 'Secret', risk: 'high' },
      { pattern: /token[_-]?=\s*['"][^'"]+['"]/, type: 'Token', risk: 'medium' },
      { pattern: /private[_-]?key[_-]?=\s*['"][^'"]+['"]/, type: 'Private Key', risk: 'high' },
      { pattern: /credit[_-]?card[_-]?number[_-]?=\s*\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/, type: 'Credit Card', risk: 'critical' }
    ];

    const sensitiveData: SensitiveData[] = [];

    sensitivePatterns.forEach(({ pattern, type, risk }) => {
      const matches = code.match(new RegExp(pattern.source, 'g'));
      if (matches) {
        matches.forEach((match) => {
          const lines = code.split('\n');
          let currentLine = 0;
          let column = 0;
          
          for (let i = 0; i < lines.length; i++) {
            const lineContent = lines[i];
            const matchIndex = lineContent.indexOf(match);
            if (matchIndex !== -1) {
              currentLine = i + 1;
              column = matchIndex + 1;
              break;
            }
          }

          sensitiveData.push({
            type,
            location: {
              file: filePath,
              line: currentLine,
              column
            },
            risk: risk as 'low' | 'medium' | 'high' | 'critical',
            recommendation: this.getRecommendationForType(type)
          });
        });
      }
    });

    return sensitiveData;
  }

  /**
   * Get recommendation for sensitive data type
   */
  private getRecommendationForType(type: string): string {
    const recommendations: Record<string, string> = {
      'API Key': 'Use environment variables or secure key management service',
      'Password': 'Use secure password hashing and salt',
      'Secret': 'Use secure secret management with proper encryption',
      'Token': 'Use secure token storage with rotation',
      'Private Key': 'Use secure key management and never commit to version control',
      'Credit Card': 'Never store credit card numbers, use payment processor APIs'
    };

    return recommendations[type] || 'Use secure storage practices';
  }

  /**
   * Generate security report
   */
  public generateSecurityReport(analysis: SecurityMetrics): {
    summary: {
      totalVulnerabilities: number;
      criticalCount: number;
      highCount: number;
      mediumCount: number;
      lowCount: number;
      overallRiskScore: number;
      complianceScore: number;
      sensitiveDataCount: number;
    };
    recommendations: Array<{
      priority: 'low' | 'medium' | 'high' | 'critical';
      category: string;
      description: string;
      action: string;
    }>;
    complianceStatus: {
      owasp: boolean;
      gdpr: boolean;
      pci: boolean;
      sox: boolean;
    };
  } {
    // Generate dynamic recommendations based on vulnerabilities and sensitive data
    const recommendations = this.generateDynamicRecommendations(analysis);
    
    // Calculate compliance status based on vulnerabilities and sensitive data
    const complianceStatus = this.calculateComplianceStatus(analysis);

    return {
      summary: {
        totalVulnerabilities: analysis.vulnerabilities.length,
        criticalCount: analysis.vulnerabilities.filter((v) => v.severity === 'critical').length,
        highCount: analysis.vulnerabilities.filter((v) => v.severity === 'high').length,
        mediumCount: analysis.vulnerabilities.filter((v) => v.severity === 'medium').length,
        lowCount: analysis.vulnerabilities.filter((v) => v.severity === 'low').length,
        overallRiskScore: analysis.riskScore,
        complianceScore: analysis.complianceScore,
        sensitiveDataCount: analysis.sensitiveData.length
      },
      recommendations,
      complianceStatus
    };
  }

  /**
   * Generate dynamic recommendations based on vulnerabilities and sensitive data
   */
  private generateDynamicRecommendations(analysis: SecurityMetrics): Array<{
    priority: 'low' | 'medium' | 'high' | 'critical';
    category: string;
    description: string;
    action: string;
  }> {
    const recommendations: Array<{
      priority: 'low' | 'medium' | 'high' | 'critical';
      category: string;
      description: string;
      action: string;
    }> = [];

    // Group vulnerabilities by type and severity
    const vulnByType = new Map<string, SecurityVulnerability[]>();
    analysis.vulnerabilities.forEach(vuln => {
      if (!vulnByType.has(vuln.type)) {
        vulnByType.set(vuln.type, []);
      }
      vulnByType.get(vuln.type)!.push(vuln);
    });

    // Generate recommendations for critical vulnerabilities
    const criticalVulns = analysis.vulnerabilities.filter(v => v.severity === 'critical');
    if (criticalVulns.length > 0) {
      recommendations.push({
        priority: 'critical',
        category: 'Critical Vulnerability Remediation',
        description: `Address ${criticalVulns.length} critical security vulnerability(ies) immediately`,
        action: 'Patch critical vulnerabilities and deploy hotfix within 24 hours'
      });
    }

    // Generate recommendations for high severity vulnerabilities
    const highVulns = analysis.vulnerabilities.filter(v => v.severity === 'high');
    if (highVulns.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'High Severity Vulnerability Remediation',
        description: `Address ${highVulns.length} high severity vulnerability(ies) as soon as possible`,
        action: 'Schedule patch deployment within 7 days for high severity issues'
      });
    }

    // Generate type-specific recommendations
    vulnByType.forEach((vulns, type) => {
      const maxSeverity = this.getMaxSeverity(vulns);
      const recommendation = this.getTypeSpecificRecommendation(type, maxSeverity);
      if (recommendation) {
        recommendations.push(recommendation);
      }
    });

    // Generate recommendations for sensitive data exposure
    const highSensitiveData = analysis.sensitiveData.filter(d => d.risk === 'high' || d.risk === 'critical');
    
    if (highSensitiveData.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'Sensitive Data Protection',
        description: `High-risk sensitive data exposure detected: ${highSensitiveData.map(d => d.type).join(', ')}`,
        action: 'Migrate sensitive data to environment variables or secure secret management'
      });
    }


    // Generate compliance-specific recommendations
    if (analysis.complianceScore < 80) {
      recommendations.push({
        priority: 'high',
        category: 'OWASP Compliance',
        description: `OWASP compliance score is ${analysis.complianceScore}%. Below recommended threshold.`,
        action: 'Review OWASP Top 10 and implement missing security controls'
      });
    }

    if (analysis.sensitiveData.some(d => d.type === 'Credit Card')) {
      recommendations.push({
        priority: 'critical',
        category: 'PCI DSS Compliance',
        description: 'Payment card data or credentials detected in code - PCI DSS violation',
        action: 'Remove all payment card data and implement PCI-compliant data handling'
      });
    }

    if (analysis.sensitiveData.some(d => ['Password', 'Secret', 'Private Key', 'Token'].includes(d.type))) {
      recommendations.push({
        priority: 'high',
        category: 'GDPR Compliance',
        description: 'Personal data or credentials detected in code - potential GDPR violation',
        action: 'Implement data minimization and secure storage practices per GDPR requirements'
      });
    }

    // Sort recommendations by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recommendations;
  }

  /**
   * Get maximum severity from a list of vulnerabilities
   */
  private getMaxSeverity(vulnerabilities: SecurityVulnerability[]): 'low' | 'medium' | 'high' | 'critical' {
    if (vulnerabilities.some(v => v.severity === 'critical')) return 'critical';
    if (vulnerabilities.some(v => v.severity === 'high')) return 'high';
    if (vulnerabilities.some(v => v.severity === 'medium')) return 'medium';
    return 'low';
  }

  /**
   * Get type-specific recommendation for a vulnerability type
   */
  private getTypeSpecificRecommendation(
    type: string,
    severity: 'low' | 'medium' | 'high' | 'critical'
  ): { priority: 'low' | 'medium' | 'high' | 'critical'; category: string; description: string; action: string } | null {
    const recommendations: Record<string, { category: string; description: string; action: string }> = {
      'SQL Injection': {
        category: 'Injection Prevention',
        description: 'SQL injection vulnerability detected',
        action: 'Use parameterized queries, prepared statements, or ORM with input validation'
      },
      'XSS': {
        category: 'Cross-Site Scripting Prevention',
        description: 'Cross-site scripting vulnerability detected',
        action: 'Implement output encoding, input sanitization, and Content Security Policy (CSP)'
      },
      'Hardcoded Credentials': {
        category: 'Credential Management',
        description: 'Hardcoded credentials detected in source code',
        action: 'Move all credentials to environment variables or secure secret management service'
      },
      'CSRF': {
        category: 'Cross-Site Request Forgery Prevention',
        description: 'CSRF vulnerability detected',
        action: 'Implement anti-CSRF tokens and SameSite cookie attributes'
      },
      'Path Traversal': {
        category: 'Path Traversal Prevention',
        description: 'Path traversal vulnerability detected',
        action: 'Validate and sanitize all file paths, use allowlist approach'
      },
      'Command Injection': {
        category: 'Command Injection Prevention',
        description: 'Command injection vulnerability detected',
        action: 'Avoid shell commands with user input, use safe APIs instead'
      },
      'Insecure Deserialization': {
        category: 'Deserialization Security',
        description: 'Insecure deserialization detected',
        action: 'Use safe deserialization methods, validate input, implement integrity checks'
      },
      'SSRF': {
        category: 'Server-Side Request Forgery Prevention',
        description: 'SSRF vulnerability detected',
        action: 'Validate and sanitize URLs, implement allowlist for external requests'
      },
      'XXE': {
        category: 'XML External Entity Prevention',
        description: 'XXE vulnerability detected',
        action: 'Disable XML external entities, use safe XML parsers'
      },
      'Broken Authentication': {
        category: 'Authentication Security',
        description: 'Broken authentication detected',
        action: 'Implement multi-factor authentication, secure session management'
      },
      'Security Misconfiguration': {
        category: 'Security Configuration',
        description: 'Security misconfiguration detected',
        action: 'Review and harden all security configurations, remove default credentials'
      },
      'Sensitive Data Exposure': {
        category: 'Data Protection',
        description: 'Sensitive data exposure detected',
        action: 'Encrypt sensitive data at rest and in transit, implement data masking'
      },
      'Insufficient Logging': {
        category: 'Logging and Monitoring',
        description: 'Insufficient security logging detected',
        action: 'Implement comprehensive security logging and real-time monitoring'
      },
      'Broken Access Control': {
        category: 'Access Control',
        description: 'Broken access control detected',
        action: 'Implement proper authorization checks, enforce principle of least privilege'
      },
      'Cryptographic Failures': {
        category: 'Cryptography',
        description: 'Cryptographic failures detected',
        action: 'Use strong encryption algorithms, proper key management, secure random generation'
      }
    };

    const rec = recommendations[type];
    if (!rec) return null;

    return {
      priority: severity,
      ...rec
    };
  }

  /**
   * Calculate compliance status based on analysis results
   */
  private calculateComplianceStatus(analysis: SecurityMetrics): {
    owasp: boolean;
    gdpr: boolean;
    pci: boolean;
    sox: boolean;
  } {
    // OWASP: Check for common vulnerabilities and secure coding practices
    const owaspScore = analysis.complianceScore;
    const hasCriticalVulns = analysis.vulnerabilities.some(v => v.severity === 'critical');
    const highVulnCount = analysis.vulnerabilities.filter(v => v.severity === 'high').length;
    const owaspCompliant = owaspScore >= 80 && !hasCriticalVulns && highVulnCount <= 2;

    // GDPR: Check for personal data protection
    const hasPersonalData = analysis.sensitiveData.some(d => 
      ['Password', 'Secret', 'Private Key', 'Token', 'Credit Card'].includes(d.type)
    );
    const gdprCompliant = !hasPersonalData && owaspScore >= 75;

    // PCI: Check for payment card data protection
    const hasCardData = analysis.sensitiveData.some(d => d.type === 'Credit Card');
    const pciCompliant = !hasCardData && owaspScore >= 90 && !hasCriticalVulns;

    // SOX: Check for audit trail and access controls
    const soxCompliant = owaspScore >= 70 && !hasCriticalVulns;

    return {
      owasp: owaspCompliant,
      gdpr: gdprCompliant,
      pci: pciCompliant,
      sox: soxCompliant
    };
  }

  /**
   * Check for common security anti-patterns
   */
  public checkAntiPatterns(code: string): Array<{
    pattern: string;
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    location: number;
    description: string;
  }> {
    const antiPatterns: AntiPattern[] = [
      {
        pattern: /eval\s*\(/,
        type: 'Dynamic Code Execution',
        severity: 'critical',
        description: 'Use of eval() function detected - allows arbitrary code execution'
      },
      {
        pattern: /setTimeout\s*\(\s*['"][^'"]+['"]/,
        type: 'Code Injection',
        severity: 'high',
        description: 'String argument in setTimeout() detected - can lead to code injection'
      },
      {
        pattern: /setInterval\s*\(\s*['"][^'"]+['"]/,
        type: 'Code Injection',
        severity: 'high',
        description: 'String argument in setInterval() detected - can lead to code injection'
      },
      {
        pattern: /setTimeout\s*\(\s*function/,
        type: 'Code Injection',
        severity: 'medium',
        description: 'Function expression in setTimeout() detected - prefer arrow functions or named functions'
      },
      {
        pattern: /new\s+Function\s*\(/,
        type: 'Dynamic Code Execution',
        severity: 'critical',
        description: 'Function() constructor detected - allows arbitrary code execution'
      },
      {
        pattern: /execScript\s*\(/,
        type: 'Dynamic Code Execution',
        severity: 'critical',
        description: 'execScript() detected - deprecated and dangerous dynamic code execution'
      },
      {
        pattern: /innerHTML\s*=/,
        type: 'XSS Vulnerability',
        severity: 'high',
        description: 'Direct innerHTML assignment detected - XSS vulnerability risk'
      },
      {
        pattern: /outerHTML\s*=/,
        type: 'XSS Vulnerability',
        severity: 'high',
        description: 'Direct outerHTML assignment detected - XSS vulnerability risk'
      },
      {
        pattern: /document\.write\s*\(/,
        type: 'DOM Manipulation',
        severity: 'medium',
        description: 'Direct document.write() usage detected - can overwrite entire document'
      },
      {
        pattern: /document\.writeln\s*\(/,
        type: 'DOM Manipulation',
        severity: 'medium',
        description: 'Direct document.writeln() usage detected - can overwrite entire document'
      },
      {
        pattern: /document\.cookie\s*=/,
        type: 'Insecure Cookie Handling',
        severity: 'medium',
        description: 'Direct document.cookie assignment detected - may lack security flags'
      },
      {
        pattern: /localStorage\.(setItem|getItem|removeItem)\s*\(\s*['"](password|secret|token|api[_-]?key|credit[_-]?card)/i,
        type: 'Insecure Storage',
        severity: 'high',
        description: 'Sensitive data stored in localStorage - not secure for credentials'
      },
      {
        pattern: /sessionStorage\.(setItem|getItem|removeItem)\s*\(\s*['"](password|secret|token|api[_-]?key|credit[_-]?card)/i,
        type: 'Insecure Storage',
        severity: 'high',
        description: 'Sensitive data stored in sessionStorage - not secure for credentials'
      },
      {
        pattern: /localStorage\.(setItem|getItem|removeItem)/,
        type: 'Insecure Storage',
        severity: 'low',
        description: 'localStorage usage detected - consider security implications'
      },
      {
        pattern: /sessionStorage\.(setItem|getItem|removeItem)/,
        type: 'Insecure Storage',
        severity: 'low',
        description: 'sessionStorage usage detected - consider security implications'
      },
      {
        pattern: /document\.createElement\s*\(\s*['"]script['"]\s*\)\s*\.src\s*=/,
        type: 'Dynamic Script Loading',
        severity: 'medium',
        description: 'Dynamic script element creation detected - potential XSS risk'
      },
      {
        pattern: /\.insertAdjacentHTML\s*\(/,
        type: 'XSS Vulnerability',
        severity: 'high',
        description: 'insertAdjacentHTML() detected - XSS vulnerability risk'
      },
      {
        pattern: /\.insertAdjacentText\s*\(/,
        type: 'DOM Manipulation',
        severity: 'low',
        description: 'insertAdjacentText() detected - generally safe but review context'
      },
      {
        pattern: /document\.open\s*\(/,
        type: 'DOM Manipulation',
        severity: 'high',
        description: 'document.open() detected - can clear entire document'
      },
      {
        pattern: /location\.href\s*=/,
        type: 'Open Redirect',
        severity: 'medium',
        description: 'Direct location.href assignment detected - potential open redirect vulnerability'
      },
      {
        pattern: /location\.replace\s*\(/,
        type: 'Open Redirect',
        severity: 'medium',
        description: 'location.replace() detected - potential open redirect vulnerability'
      },
      {
        pattern: /window\.open\s*\(\s*[^)]+\)/,
        type: 'Window Manipulation',
        severity: 'low',
        description: 'window.open() detected - review for popup security'
      },
      {
        pattern: /atob\s*\(/,
        type: 'Base64 Decoding',
        severity: 'medium',
        description: 'atob() detected - may be used to decode obfuscated malicious code'
      },
      {
        pattern: /btoa\s*\(/,
        type: 'Base64 Encoding',
        severity: 'low',
        description: 'btoa() detected - review encoding usage'
      },
      {
        pattern: /escape\s*\(/,
        type: 'Deprecated Encoding',
        severity: 'low',
        description: 'escape() detected - deprecated function, use encodeURIComponent instead'
      },
      {
        pattern: /unescape\s*\(/,
        type: 'Deprecated Encoding',
        severity: 'low',
        description: 'unescape() detected - deprecated function, use decodeURIComponent instead'
      }
    ];

    const results: Array<{
      pattern: string;
      type: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      location: number;
      description: string;
    }> = [];

    // Track found patterns to avoid duplicates
    const foundPatterns = new Set<string>();

    antiPatterns.forEach(({ pattern, type, severity: patternSeverity, description }) => {
      const matches = code.matchAll(new RegExp(pattern.source, 'g'));
      for (const match of matches) {
        const matchIndex = match.index || 0;
        const patternKey = `${type}_${matchIndex}`;
        
        if (!foundPatterns.has(patternKey)) {
          foundPatterns.add(patternKey);
          const lines = code.substring(0, matchIndex).split('\n');
          results.push({
            pattern: pattern.source,
            type,
            severity: patternSeverity,
            location: lines.length + 1,
            description
          });
        }
      }
    });

    // Sort results by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    results.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return results;
  }
}
