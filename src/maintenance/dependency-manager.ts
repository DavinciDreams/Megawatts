/**
 * Dependency Manager
 *
 * Dependency management system for automated dependency updates with security patches,
 * vulnerability scanning for dependencies, update scheduling and testing,
 * and rollback capability.
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { Logger } from '../utils/logger';
import { MaintenanceRepository } from './maintenance-repository';
import {
  DependencyUpdate,
  SecuritySeverity,
  MaintenanceStatus,
  MaintenancePriority,
  MaintenanceType,
} from './maintenance-models';

const execAsync = promisify(exec);

/**
 * Dependency manager configuration
 */
export interface DependencyManagerConfig {
  checkInterval: number; // in milliseconds
  autoUpdateSecurityPatches: boolean;
  autoUpdateMinorPatches: boolean;
  autoUpdatePatchPatches: boolean;
  requireTests: boolean;
  rollbackOnFailure: boolean;
  notifyChannels: string[];
  retentionPeriod: number; // in milliseconds
}

/**
 * Default dependency manager configuration
 */
export const DEFAULT_DEPENDENCY_MANAGER_CONFIG: DependencyManagerConfig = {
  checkInterval: 86400000, // 24 hours
  autoUpdateSecurityPatches: true,
  autoUpdateMinorPatches: false,
  autoUpdatePatchPatches: true,
  requireTests: true,
  rollbackOnFailure: true,
  notifyChannels: [],
  retentionPeriod: 2592000000, // 30 days
};

/**
 * Package information
 */
export interface PackageInfo {
  name: string;
  currentVersion: string;
  latestVersion: string;
  wantedVersion: string;
  homepage?: string;
  repository?: string;
  time?: string;
}

/**
 * Vulnerability information
 */
export interface VulnerabilityInfo {
  id: string;
  title: string;
  severity: SecuritySeverity;
  cvssScore?: number;
  patchedIn: string;
  url?: string;
  publishedDate: Date;
}

/**
 * Update test result
 */
export interface UpdateTestResult {
  updateId: string;
  packageName: string;
  fromVersion: string;
  toVersion: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  output: string;
  error?: string;
  testedAt: Date;
}

/**
 * Rollback information
 */
export interface RollbackInfo {
  updateId: string;
  packageName: string;
  fromVersion: string;
  toVersion: string;
  rollbackToVersion: string;
  status: 'in_progress' | 'completed' | 'failed';
  reason: string;
  rolledBackAt?: Date;
}

/**
 * Dependency conflict information
 */
export interface DependencyConflict {
  packageName: string;
  conflictType: 'version_mismatch' | 'circular' | 'peer_dependency' | 'duplicate';
  details: string;
  severity: 'error' | 'warning' | 'info';
  affectedPackages: string[];
}

/**
 * Dependency impact analysis result
 */
export interface DependencyImpactAnalysis {
  packageName: string;
  currentVersion: string;
  targetVersion: string;
  updateType: 'major' | 'minor' | 'patch' | 'prerelease';
  breakingChanges: string[];
  affectedDependencies: string[];
  transitiveDependencies: string[];
  estimatedRisk: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

/**
 * Dependency optimization result
 */
export interface DependencyOptimizationResult {
  totalPackages: number;
  unusedPackages: string[];
  outdatedPackages: Array<{ name: string; current: string; latest: string }>;
  duplicatePackages: Array<{ name: string; versions: string[] }>;
  securityVulnerabilities: Array<{ name: string; severity: SecuritySeverity }>;
  estimatedSizeReduction: number;
  recommendations: string[];
}

/**
 * Package lock entry for dependency tree analysis
 */
export interface PackageLockEntry {
  name?: string;
  version: string;
  dependencies?: Record<string, PackageLockEntry>;
  requires?: Record<string, string>;
  dev?: boolean;
}

/**
 * Dependency manager class
 */
export class DependencyManager extends EventEmitter {
  private config: DependencyManagerConfig;
  private repository: MaintenanceRepository;
  private logger: Logger;
  private checkInterval?: NodeJS.Timeout;
  private isRunning = false;
  private updateHistory: DependencyUpdate[] = [];
  private testResults: UpdateTestResult[] = [];
  private packageJsonPath: string;
  private packageLockJsonPath: string;

  constructor(
    repository: MaintenanceRepository,
    config: Partial<DependencyManagerConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_DEPENDENCY_MANAGER_CONFIG, ...config };
    this.repository = repository;
    this.logger = new Logger('DependencyManager');
    this.packageJsonPath = join(process.cwd(), 'package.json');
    this.packageLockJsonPath = join(process.cwd(), 'package-lock.json');
  }

  /**
   * Start dependency manager
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('Dependency manager is already running');
      return;
    }

    this.isRunning = true;

    // Schedule regular dependency checks
    this.checkInterval = setInterval(() => {
      this.checkForUpdates().catch(error => {
        this.logger.error('Dependency check failed:', error);
      });
    }, this.config.checkInterval);

    this.logger.info('Dependency manager started');
    this.emit('started');
  }

  /**
   * Stop dependency manager
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }

    this.logger.info('Dependency manager stopped');
    this.emit('stopped');
  }

  /**
   * Parse semver version string into components
   * @param version - Version string to parse
   * @returns Object with major, minor, patch, and prerelease components
   */
  private parseSemver(version: string): {
    major: number;
    minor: number;
    patch: number;
    prerelease?: string;
    build?: string;
  } | null {
    // Handle caret (^) and tilde (~) prefixes
    const cleanVersion = version.replace(/^[~^]/, '');
    const match = cleanVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/);
    
    if (!match) {
      return null;
    }

    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
      prerelease: match[4],
      build: match[5],
    };
  }

  /**
   * Compare two semver versions
   * @param version1 - First version
   * @param version2 - Second version
   * @returns -1 if version1 < version2, 0 if equal, 1 if version1 > version2
   */
  private compareVersions(version1: string, version2: string): number {
    const v1 = this.parseSemver(version1);
    const v2 = this.parseSemver(version2);

    if (!v1 || !v2) {
      return 0;
    }

    // Compare major version
    if (v1.major !== v2.major) {
      return v1.major < v2.major ? -1 : 1;
    }

    // Compare minor version
    if (v1.minor !== v2.minor) {
      return v1.minor < v2.minor ? -1 : 1;
    }

    // Compare patch version
    if (v1.patch !== v2.patch) {
      return v1.patch < v2.patch ? -1 : 1;
    }

    // Handle prerelease versions
    if (v1.prerelease && !v2.prerelease) {
      return -1; // prerelease < release
    }
    if (!v1.prerelease && v2.prerelease) {
      return 1; // release > prerelease
    }
    if (v1.prerelease && v2.prerelease) {
      return v1.prerelease.localeCompare(v2.prerelease);
    }

    return 0;
  }

  /**
   * Determine update type between two versions
   * @param fromVersion - Source version
   * @param toVersion - Target version
   * @returns Update type: major, minor, patch, or prerelease
   */
  private getUpdateType(fromVersion: string, toVersion: string): 'major' | 'minor' | 'patch' | 'prerelease' {
    const from = this.parseSemver(fromVersion);
    const to = this.parseSemver(toVersion);

    if (!from || !to) {
      return 'patch';
    }

    // Check if it's a prerelease update
    if (to.prerelease) {
      return 'prerelease';
    }

    if (to.major > from.major) {
      return 'major';
    }
    if (to.minor > from.minor) {
      return 'minor';
    }
    return 'patch';
  }

  /**
   * Fetch package information from npm registry
   * @param packageName - Name of the package
   * @returns Package information from npm registry
   */
  private async fetchPackageFromRegistry(packageName: string): Promise<{
    'dist-tags': { latest: string; [key: string]: string };
    versions: Record<string, any>;
    time: Record<string, string>;
  } | null> {
    try {
      const response = await axios.get(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
        timeout: 10000,
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.warn(`Failed to fetch package ${packageName} from npm registry: ${error.message}`);
      } else {
        this.logger.warn(`Failed to fetch package ${packageName} from npm registry:`, error);
      }
      return null;
    }
  }

  /**
   * Get latest version that satisfies a version range
   * @param versionRange - Version range (e.g., ^1.2.3, ~2.0.0, *)
   * @param availableVersions - Available versions from registry
   * @returns Latest satisfying version or null
   */
  private getLatestSatisfyingVersion(
    versionRange: string,
    availableVersions: string[]
  ): string | null {
    if (!versionRange || versionRange === '*') {
      // Return the latest version
      return availableVersions.length > 0 ? availableVersions[0] : null;
    }

    const cleanRange = versionRange.replace(/^[~^]/, '');
    const parsedRange = this.parseSemver(cleanRange);

    if (!parsedRange) {
      return null;
    }

    for (const version of availableVersions) {
      const parsed = this.parseSemver(version);
      if (!parsed) continue;

      // Handle caret (^) - compatible with changes that don't break the public API
      if (versionRange.startsWith('^')) {
        if (parsed.major === parsedRange.major) {
          return version;
        }
      }
      // Handle tilde (~) - compatible with changes in patch version only
      else if (versionRange.startsWith('~')) {
        if (parsed.major === parsedRange.major && parsed.minor === parsedRange.minor) {
          return version;
        }
      }
      // Exact version match
      else {
        if (this.compareVersions(version, cleanRange) === 0) {
          return version;
        }
      }
    }

    return null;
  }

  /**
   * Read and parse package.json file
   * @returns Parsed package.json content
   */
  private async readPackageJson(): Promise<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  }> {
    try {
      const content = await fs.readFile(this.packageJsonPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      this.logger.error('Failed to read package.json:', error);
      throw new Error('Failed to read package.json');
    }
  }

  /**
   * Read and parse package-lock.json file
   * @returns Parsed package-lock.json content
   */
  private async readPackageLockJson(): Promise<PackageLockEntry | null> {
    try {
      const content = await fs.readFile(this.packageLockJsonPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      this.logger.warn('Failed to read package-lock.json:', error);
      return null;
    }
  }

  /**
   * Write updated package.json file
   * @param packageJson - Updated package.json content
   */
  private async writePackageJson(packageJson: any): Promise<void> {
    try {
      await fs.writeFile(this.packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8');
      this.logger.info('package.json updated successfully');
    } catch (error) {
      this.logger.error('Failed to write package.json:', error);
      throw new Error('Failed to write package.json');
    }
  }

  /**
   * Collect transitive dependencies from package-lock.json
   * @param entry - Package lock entry to traverse
   * @param packageName - Target package name
   * @param collected - Set to collect transitive dependencies
   */
  private collectTransitiveDependencies(
    entry: PackageLockEntry,
    packageName: string,
    collected: string[]
  ): void {
    if (entry.name === packageName && entry.dependencies) {
      for (const depName of Object.keys(entry.dependencies)) {
        if (!collected.includes(depName)) {
          collected.push(depName);
          // Recursively collect transitive dependencies
          this.collectTransitiveDependencies(entry.dependencies[depName], depName, collected);
        }
      }
    }
    
    // Also check nested dependencies
    if (entry.dependencies) {
      for (const depEntry of Object.values(entry.dependencies)) {
        this.collectTransitiveDependencies(depEntry, packageName, collected);
      }
    }
  }

  /**
   * Scan dependencies for analysis
   * @returns Array of package information with metadata
   */
  async scanDependencies(): Promise<PackageInfo[]> {
    this.logger.info('Scanning dependencies');

    try {
      const packages = await this.getInstalledPackages();
      
      // Fetch latest versions from npm registry for each package
      for (const pkg of packages) {
        const registryData = await this.fetchPackageFromRegistry(pkg.name);
        if (registryData) {
          pkg.latestVersion = registryData['dist-tags'].latest;
          pkg.wantedVersion = this.getLatestSatisfyingVersion(
            pkg.currentVersion,
            Object.keys(registryData.versions)
          ) || pkg.currentVersion;
          pkg.time = registryData.time[pkg.latestVersion];
        }
      }

      this.logger.info(`Scanned ${packages.length} dependencies`);
      this.emit('dependenciesScanned', packages);

      return packages;
    } catch (error) {
      this.logger.error('Failed to scan dependencies:', error);
      throw error;
    }
  }

  /**
   * Check for dependency updates
   * @returns Array of available updates
   */
  async checkForUpdates(): Promise<DependencyUpdate[]> {
    this.logger.info('Checking for dependency updates');

    const updates: DependencyUpdate[] = [];

    try {
      // Get current dependencies from package.json
      const packages = await this.getInstalledPackages();

      for (const pkg of packages) {
        const update = await this.checkPackageForUpdates(pkg);
        if (update) {
          updates.push(update);
        }
      }

      this.logger.info(`Found ${updates.length} dependency updates`);

      // Store in history
      this.updateHistory.push(...updates);

      // Trim history
      const cutoff = Date.now() - this.config.retentionPeriod;
      this.updateHistory = this.updateHistory.filter(u => u.createdAt.getTime() > cutoff);

      this.emit('updatesFound', updates);

    } catch (error) {
      this.logger.error('Failed to check for updates:', error);
    }

    return updates;
  }

  /**
   * Get installed packages
   * @returns Array of package information
   */
  private async getInstalledPackages(): Promise<PackageInfo[]> {
    const packages: PackageInfo[] = [];

    try {
      // Read and parse package.json
      const packageJson = await this.readPackageJson();
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      for (const [name, version] of Object.entries(dependencies)) {
        packages.push({
          name,
          currentVersion: version,
          latestVersion: version, // Will be updated by check
          wantedVersion: version, // Will be updated by check
        });
      }

    } catch (error) {
      this.logger.error('Failed to get installed packages:', error);
    }

    return packages;
  }

  /**
   * Check a specific package for updates
   * @param pkg - Package information
   * @returns Dependency update or null if no update available
   */
  private async checkPackageForUpdates(pkg: PackageInfo): Promise<DependencyUpdate | null> {
    try {
      // Fetch package information from npm registry
      const registryData = await this.fetchPackageFromRegistry(pkg.name);
      
      if (!registryData) {
        return null;
      }

      const latestVersion = registryData['dist-tags'].latest;
      const currentVersion = pkg.currentVersion.replace(/^[~^]/, '');
      
      // Check if there's an update available
      if (this.compareVersions(latestVersion, currentVersion) <= 0) {
        return null; // No update available
      }

      // Determine update type
      const updateType = this.getUpdateType(currentVersion, latestVersion);

      // Check for security vulnerabilities
      const vulnerabilities = await this.checkPackageVulnerabilities(pkg);
      const isSecurityUpdate = vulnerabilities.length > 0;
      const severity = isSecurityUpdate ? this.getMaxSeverity(vulnerabilities) : SecuritySeverity.INFO;

      // Create dependency update record
      const update = await this.repository.createDependencyUpdate({
        packageName: pkg.name,
        currentVersion: pkg.currentVersion,
        targetVersion: latestVersion,
        updateType,
        status: MaintenanceStatus.PENDING,
        severity,
        isSecurityUpdate,
        vulnerabilities: vulnerabilities.map(v => v.id),
        breakingChanges: [], // Could be fetched from package changelog
        metadata: {
          scanTime: new Date(),
          latestVersion,
          wantedVersion: this.getLatestSatisfyingVersion(
            pkg.currentVersion,
            Object.keys(registryData.versions)
          ) || pkg.currentVersion,
        },
      });

      return update;

    } catch (error) {
      this.logger.error(`Failed to check package ${pkg.name}:`, error);
      return null;
    }
  }

  /**
   * Scan dependencies for vulnerabilities
   * @returns Array of dependency updates with vulnerabilities
   */
  async scanForVulnerabilities(): Promise<DependencyUpdate[]> {
    this.logger.info('Scanning dependencies for vulnerabilities');

    const vulnerableUpdates: DependencyUpdate[] = [];

    try {
      // Get current dependencies
      const packages = await this.getInstalledPackages();

      for (const pkg of packages) {
        const vulnerabilities = await this.checkPackageVulnerabilities(pkg);
        if (vulnerabilities.length > 0) {
          const update = await this.repository.createDependencyUpdate({
            packageName: pkg.name,
            currentVersion: pkg.currentVersion,
            targetVersion: pkg.latestVersion,
            updateType: 'patch',
            status: MaintenanceStatus.PENDING,
            severity: this.getMaxSeverity(vulnerabilities),
            isSecurityUpdate: true,
            vulnerabilities: vulnerabilities.map(v => v.id),
            breakingChanges: [],
            metadata: {
              scanTime: new Date(),
              vulnerabilityDetails: vulnerabilities,
            },
          });

          vulnerableUpdates.push(update);
        }
      }

      this.logger.info(`Found ${vulnerableUpdates.length} packages with vulnerabilities`);

      this.emit('vulnerabilitiesFound', vulnerableUpdates);

    } catch (error) {
      this.logger.error('Failed to scan for vulnerabilities:', error);
    }

    return vulnerableUpdates;
  }

  /**
   * Check a specific package for vulnerabilities
   * @param pkg - Package information
   * @returns Array of vulnerability information
   */
  private async checkPackageVulnerabilities(pkg: PackageInfo): Promise<VulnerabilityInfo[]> {
    try {
      // Use npm audit API to check for vulnerabilities
      const { stdout, stderr } = await execAsync('npm audit --json', {
        cwd: process.cwd(),
        timeout: 30000,
      });

      if (stderr && !stdout) {
        this.logger.warn(`npm audit warning for ${pkg.name}: ${stderr}`);
        return [];
      }

      const auditResult = JSON.parse(stdout);
      const vulnerabilities: VulnerabilityInfo[] = [];

      // Check for vulnerabilities in the specific package
      if (auditResult.vulnerabilities) {
        for (const [vulnId, vulnData] of Object.entries(auditResult.vulnerabilities)) {
          const vuln = vulnData as any;
          
          // Check if this vulnerability affects our package
          const affectsPackage = vuln.findings?.some((finding: any) =>
            finding.paths?.some((path: string) =>
              path.includes(pkg.name)
            )
          );

          if (affectsPackage) {
            vulnerabilities.push({
              id: vulnId,
              title: vuln.title || vuln.name || 'Unknown vulnerability',
              severity: this.mapAuditSeverity(vuln.severity),
              cvssScore: vuln.cvss?.score,
              patchedIn: vuln.patchedVersions?.[0] || 'N/A',
              url: vuln.url,
              publishedDate: new Date(vuln.created || Date.now()),
            });
          }
        }
      }

      return vulnerabilities;

    } catch (error) {
      // npm audit returns non-zero exit code if vulnerabilities found
      // Try to parse the output anyway
      try {
        const errorStr = error instanceof Error ? error.message : String(error);
        const jsonMatch = errorStr.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const auditResult = JSON.parse(jsonMatch[0]);
          const vulnerabilities: VulnerabilityInfo[] = [];

          if (auditResult.vulnerabilities) {
            for (const [vulnId, vulnData] of Object.entries(auditResult.vulnerabilities)) {
              const vuln = vulnData as any;
              
              const affectsPackage = vuln.findings?.some((finding: any) =>
                finding.paths?.some((path: string) =>
                  path.includes(pkg.name)
                )
              );

              if (affectsPackage) {
                vulnerabilities.push({
                  id: vulnId,
                  title: vuln.title || vuln.name || 'Unknown vulnerability',
                  severity: this.mapAuditSeverity(vuln.severity),
                  cvssScore: vuln.cvss?.score,
                  patchedIn: vuln.patchedVersions?.[0] || 'N/A',
                  url: vuln.url,
                  publishedDate: new Date(vuln.created || Date.now()),
                });
              }
            }
          }

          return vulnerabilities;
        }
      } catch {
        // If we can't parse, return empty array
      }
      
      this.logger.warn(`Could not check vulnerabilities for ${pkg.name}:`, error);
      return [];
    }
  }

  /**
   * Map npm audit severity to SecuritySeverity enum
   * @param severity - npm audit severity string
   * @returns SecuritySeverity enum value
   */
  private mapAuditSeverity(severity: string): SecuritySeverity {
    const severityMap: Record<string, SecuritySeverity> = {
      'critical': SecuritySeverity.CRITICAL,
      'high': SecuritySeverity.HIGH,
      'moderate': SecuritySeverity.MEDIUM,
      'low': SecuritySeverity.LOW,
      'info': SecuritySeverity.INFO,
    };
    
    return severityMap[severity.toLowerCase()] || SecuritySeverity.INFO;
  }

  /**
   * Get maximum severity from vulnerabilities
   * @param vulnerabilities - Array of vulnerability information
   * @returns Maximum severity
   */
  private getMaxSeverity(vulnerabilities: VulnerabilityInfo[]): SecuritySeverity {
    const severityOrder = [
      SecuritySeverity.CRITICAL,
      SecuritySeverity.HIGH,
      SecuritySeverity.MEDIUM,
      SecuritySeverity.LOW,
      SecuritySeverity.INFO,
    ];

    for (const severity of severityOrder) {
      if (vulnerabilities.some(v => v.severity === severity)) {
        return severity;
      }
    }

    return SecuritySeverity.INFO;
  }

  /**
   * Schedule a dependency update
   * @param update - Dependency update to schedule
   * @param scheduledFor - When to schedule the update
   * @returns Updated dependency update
   */
  async scheduleUpdate(update: DependencyUpdate, scheduledFor: Date): Promise<DependencyUpdate> {
    this.logger.info(`Scheduling update for ${update.packageName} to ${update.targetVersion} at ${scheduledFor.toISOString()}`);

    const updated = await this.repository.updateDependencyUpdate(update.id, {
      status: MaintenanceStatus.SCHEDULED,
      scheduledAt: scheduledFor,
    });

    this.emit('updateScheduled', { update, scheduledFor });
    return updated!;
  }

  /**
   * Execute a dependency update
   * @param updateId - Dependency update ID
   * @returns Updated dependency update
   */
  async executeUpdate(updateId: string): Promise<DependencyUpdate> {
    const update = await this.repository.getDependencyUpdateById(updateId);
    if (!update) {
      throw new Error(`Dependency update not found: ${updateId}`);
    }

    this.logger.info(`Executing update for ${update.packageName} from ${update.currentVersion} to ${update.targetVersion}`);

    // Update status to in progress
    await this.repository.updateDependencyUpdate(updateId, {
      status: MaintenanceStatus.IN_PROGRESS,
      startedAt: new Date(),
    });

    try {
      // Run tests before update if required
      if (this.config.requireTests) {
        const testResult = await this.runPreUpdateTests(update);
        if (!testResult.passed) {
          await this.repository.updateDependencyUpdate(updateId, {
            status: MaintenanceStatus.ON_HOLD,
            testResults: { preUpdateTest: testResult },
          });

          this.emit('updateFailed', { update, reason: 'Pre-update tests failed' });
          return (await this.repository.getDependencyUpdateById(updateId))!;
        }
      }

      // Execute the update
      const updateResult = await this.performUpdate(update);

      if (!updateResult.success) {
        throw new Error(updateResult.error || 'Update failed');
      }

      // Run post-update tests if required
      if (this.config.requireTests) {
        const testResult = await this.runPostUpdateTests(update);
        if (!testResult.passed) {
          // Rollback if configured
          if (this.config.rollbackOnFailure) {
            await this.rollbackUpdate(updateId, 'Post-update tests failed');
          }

          await this.repository.updateDependencyUpdate(updateId, {
            status: MaintenanceStatus.FAILED,
            completedAt: new Date(),
            testResults: { postUpdateTest: testResult },
          });

          this.emit('updateFailed', { update, reason: 'Post-update tests failed' });
          return (await this.repository.getDependencyUpdateById(updateId))!;
        }
      }

      // Mark as completed
      const completed = await this.repository.updateDependencyUpdate(updateId, {
        status: MaintenanceStatus.COMPLETED,
        completedAt: new Date(),
        testResults: {
          preUpdateTest: update.testResults?.preUpdateTest,
          postUpdateTest: update.testResults?.postUpdateTest,
        },
      });

      this.logger.info(`Update completed for ${update.packageName}`);
      this.emit('updateCompleted', completed!);

      return completed!;

    } catch (error) {
      // Rollback if configured
      if (this.config.rollbackOnFailure) {
        await this.rollbackUpdate(updateId, error instanceof Error ? error.message : String(error));
      }

      await this.repository.updateDependencyUpdate(updateId, {
        status: MaintenanceStatus.FAILED,
        completedAt: new Date(),
      });

      this.logger.error(`Update failed for ${update.packageName}:`, error);
      this.emit('updateFailed', { update, reason: error instanceof Error ? error.message : String(error) });

      return (await this.repository.getDependencyUpdateById(updateId))!;
    }
  }

  /**
   * Perform the actual dependency update
   * @param update - Dependency update
   * @returns Update result
   */
  private async performUpdate(update: DependencyUpdate): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      this.logger.info(`Performing update for ${update.packageName} to ${update.targetVersion}`);

      // Read current package.json
      const packageJson = await this.readPackageJson();
      
      // Determine if package is in dependencies or devDependencies
      const isDevDependency = packageJson.devDependencies?.[update.packageName] !== undefined;
      const dependencySection = isDevDependency ? 'devDependencies' : 'dependencies';

      if (!packageJson[dependencySection]) {
        packageJson[dependencySection] = {};
      }

      // Update version in package.json
      packageJson[dependencySection]![update.packageName] = update.targetVersion;

      // Write updated package.json
      await this.writePackageJson(packageJson);

      // Run npm install to update dependency
      const { stdout, stderr } = await execAsync(`npm install ${update.packageName}@${update.targetVersion}`, {
        cwd: process.cwd(),
        timeout: 120000, // 2 minutes timeout
      });

      if (stderr) {
        this.logger.warn(`npm install warnings for ${update.packageName}: ${stderr}`);
      }

      this.logger.info(`Successfully updated ${update.packageName} to ${update.targetVersion}`);
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to update ${update.packageName}: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Run pre-update tests
   * @param update - Dependency update
   * @returns Test result
   */
  private async runPreUpdateTests(update: DependencyUpdate): Promise<{
    passed: boolean;
    output: string;
  }> {
    this.logger.info(`Running pre-update tests for ${update.packageName}`);
    
    try {
      const startTime = Date.now();
      
      // Run npm test command
      const { stdout, stderr } = await execAsync('npm test', {
        cwd: process.cwd(),
        timeout: 300000, // 5 minutes timeout
      });

      const duration = Date.now() - startTime;
      
      const output = stdout || stderr || 'No test output';
      
      // Check if tests passed (npm test returns 0 on success)
      if (stderr && !stdout) {
        this.logger.warn(`Pre-update tests had warnings for ${update.packageName}: ${stderr}`);
      }

      return {
        passed: true, // If we got here, tests passed
        output: output,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Pre-update tests failed for ${update.packageName}: ${errorMessage}`);
      
      return {
        passed: false,
        output: errorMessage,
      };
    }
  }

  /**
   * Run post-update tests
   * @param update - Dependency update
   * @returns Test result
   */
  private async runPostUpdateTests(update: DependencyUpdate): Promise<{
    passed: boolean;
    output: string;
  }> {
    this.logger.info(`Running post-update tests for ${update.packageName}`);
    
    try {
      const startTime = Date.now();
      
      // Run npm test command
      const { stdout, stderr } = await execAsync('npm test', {
        cwd: process.cwd(),
        timeout: 300000, // 5 minutes timeout
      });

      const duration = Date.now() - startTime;
      
      const output = stdout || stderr || 'No test output';
      
      // Check if tests passed (npm test returns 0 on success)
      if (stderr && !stdout) {
        this.logger.warn(`Post-update tests had warnings for ${update.packageName}: ${stderr}`);
      }

      return {
        passed: true, // If we got here, tests passed
        output: output,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Post-update tests failed for ${update.packageName}: ${errorMessage}`);
      
      return {
        passed: false,
        output: errorMessage,
      };
    }
  }

  /**
   * Rollback a dependency update
   * @param updateId - Dependency update ID
   * @param reason - Reason for rollback
   * @returns Rollback information
   */
  async rollbackUpdate(updateId: string, reason: string): Promise<RollbackInfo> {
    const update = await this.repository.getDependencyUpdateById(updateId);
    if (!update) {
      throw new Error(`Dependency update not found: ${updateId}`);
    }

    this.logger.info(`Rolling back update for ${update.packageName} from ${update.targetVersion} to ${update.currentVersion}`);

    const rollbackInfo: RollbackInfo = {
      updateId,
      packageName: update.packageName,
      fromVersion: update.currentVersion,
      toVersion: update.targetVersion,
      rollbackToVersion: update.currentVersion,
      status: 'in_progress',
      reason,
    };

    try {
      // Perform the rollback
      await this.performRollback(update);

      rollbackInfo.status = 'completed';
      rollbackInfo.rolledBackAt = new Date();

      // Update the dependency update record
      await this.repository.updateDependencyUpdate(updateId, {
        rollbackVersion: update.currentVersion,
        metadata: {
          ...update.metadata,
          rollbackReason: reason,
          rollbackAt: rollbackInfo.rolledBackAt,
        },
      });

      this.logger.info(`Rollback completed for ${update.packageName}`);
      this.emit('rollbackCompleted', rollbackInfo);

    } catch (error) {
      rollbackInfo.status = 'failed';
      this.logger.error(`Rollback failed for ${update.packageName}:`, error);
      this.emit('rollbackFailed', { rollbackInfo, error });
    }

    return rollbackInfo;
  }

  /**
   * Perform the actual rollback
   * @param update - Dependency update to rollback
   */
  private async performRollback(update: DependencyUpdate): Promise<void> {
    try {
      this.logger.info(`Performing rollback for ${update.packageName} to ${update.currentVersion}`);

      // Read current package.json
      const packageJson = await this.readPackageJson();
      
      // Determine if package is in dependencies or devDependencies
      const isDevDependency = packageJson.devDependencies?.[update.packageName] !== undefined;
      const dependencySection = isDevDependency ? 'devDependencies' : 'dependencies';

      if (!packageJson[dependencySection]) {
        packageJson[dependencySection] = {};
      }

      // Revert version in package.json
      packageJson[dependencySection]![update.packageName] = update.currentVersion;

      // Write updated package.json
      await this.writePackageJson(packageJson);

      // Run npm install to restore previous version
      const { stdout, stderr } = await execAsync(`npm install ${update.packageName}@${update.currentVersion}`, {
        cwd: process.cwd(),
        timeout: 120000, // 2 minutes timeout
      });

      if (stderr) {
        this.logger.warn(`npm install warnings during rollback for ${update.packageName}: ${stderr}`);
      }

      this.logger.info(`Successfully rolled back ${update.packageName} to ${update.currentVersion}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to rollback ${update.packageName}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get pending updates
   * @returns Array of pending dependency updates
   */
  async getPendingUpdates(): Promise<DependencyUpdate[]> {
    const updates = await this.repository.getDependencyUpdates({
      where: 'status = $1',
      params: [MaintenanceStatus.PENDING],
      orderBy: 'created_at',
      orderDirection: 'DESC',
    });

    return updates;
  }

  /**
   * Get security updates
   * @returns Array of security dependency updates
   */
  async getSecurityUpdates(): Promise<DependencyUpdate[]> {
    const updates = await this.repository.getDependencyUpdates({
      where: 'is_security_update = TRUE AND status IN ($1, $2, $3)',
      params: [MaintenanceStatus.PENDING, MaintenanceStatus.SCHEDULED, MaintenanceStatus.IN_PROGRESS],
      orderBy: 'created_at',
      orderDirection: 'DESC',
    });

    return updates;
  }

  /**
   * Get update history
   * @param limit - Maximum number of updates to return
   * @returns Array of dependency updates
   */
  getUpdateHistory(limit?: number): DependencyUpdate[] {
    if (limit) {
      return this.updateHistory.slice(-limit);
    }
    return [...this.updateHistory];
  }

  /**
   * Get test results
   * @param limit - Maximum number of results to return
   * @returns Array of test results
   */
  getTestResults(limit?: number): UpdateTestResult[] {
    if (limit) {
      return this.testResults.slice(-limit);
    }
    return [...this.testResults];
  }


  /**
   * Auto-update security patches
   * @returns Number of updates executed
   */
  async autoUpdateSecurityPatches(): Promise<number> {
    if (!this.config.autoUpdateSecurityPatches) {
      this.logger.info('Auto-update for security patches is disabled');
      return 0;
    }

    this.logger.info('Auto-updating security patches');

    const securityUpdates = await this.getSecurityUpdates();
    let updatedCount = 0;

    for (const update of securityUpdates) {
      try {
        await this.executeUpdate(update.id);
        updatedCount++;
      } catch (error) {
        this.logger.error(`Failed to auto-update ${update.packageName}:`, error);
      }
    }

    this.logger.info(`Auto-updated ${updatedCount} security patches`);
    this.emit('autoUpdateCompleted', { count: updatedCount });

    return updatedCount;
  }

  /**
   * Generate dependency report
   * @returns Dependency report
   */
  async generateDependencyReport(): Promise<{
    summary: {
      totalPackages: number;
      outdatedPackages: number;
      vulnerablePackages: number;
      securityUpdates: number;
      pendingUpdates: number;
    };
    updates: DependencyUpdate[];
    recommendations: string[];
  }> {
    this.logger.info('Generating dependency report');

    // Get installed packages
    const packages = await this.getInstalledPackages();

    // Get all updates from repository
    const updates = await this.repository.getDependencyUpdates({
      orderBy: 'created_at',
      orderDirection: 'DESC',
    });

    // Calculate summary
    const outdatedPackages = updates.filter(u => u.status === MaintenanceStatus.PENDING).length;
    const vulnerablePackages = updates.filter(u => u.isSecurityUpdate).length;
    const securityUpdates = updates.filter(u => u.isSecurityUpdate).length;
    const pendingUpdates = updates.filter(u => u.status === MaintenanceStatus.PENDING).length;

    // Generate recommendations
    const recommendations = this.generateDependencyRecommendations(updates);

    const report = {
      summary: {
        totalPackages: packages.length,
        outdatedPackages,
        vulnerablePackages,
        securityUpdates,
        pendingUpdates,
      },
      updates,
      recommendations,
    };

    this.logger.info(`Dependency report generated: ${JSON.stringify(report.summary)}`);
    this.emit('reportGenerated', report);

    return report;
  }

  /**
   * Generate dependency recommendations
   * @param updates - Array of dependency updates
   * @returns Array of recommendations
   */
  private generateDependencyRecommendations(updates: DependencyUpdate[]): string[] {
    const recommendations: string[] = [];

    // Check for critical security updates
    const criticalUpdates = updates.filter(
      u => u.isSecurityUpdate && u.severity === SecuritySeverity.CRITICAL
    );
    if (criticalUpdates.length > 0) {
      recommendations.push(`Immediately update ${criticalUpdates.length} packages with critical security vulnerabilities`);
    }

    // Check for high severity updates
    const highUpdates = updates.filter(
      u => u.isSecurityUpdate && u.severity === SecuritySeverity.HIGH
    );
    if (highUpdates.length > 0) {
      recommendations.push(`Schedule updates for ${highUpdates.length} packages with high-severity vulnerabilities`);
    }

    // Check for major version updates
    const majorUpdates = updates.filter(u => u.updateType === 'major');
    if (majorUpdates.length > 0) {
      recommendations.push(`Review ${majorUpdates.length} major version updates for breaking changes`);
    }

    // General recommendations
    recommendations.push('Enable automated dependency updates for security patches');
    recommendations.push('Regularly review and update dependencies');
    recommendations.push('Implement automated testing for dependency updates');
    recommendations.push('Monitor for security advisories');

    return recommendations;
  }

  /**
   * Update configuration
   * @param newConfig - Partial configuration
   */
  updateConfig(newConfig: Partial<DependencyManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Restart intervals if running
    if (this.isRunning) {
      this.stop();
      this.start();
    }

    this.logger.info('Dependency manager configuration updated');
  }

  /**
   * Get current configuration
   * @returns Current configuration
   */
  getConfig(): DependencyManagerConfig {
    return { ...this.config };
  }

  /**
   * Update a specific dependency
   * @param packageName - Name of the package to update
   * @param version - Target version to install
   * @returns Updated dependency update
   */
  async updateDependency(packageName: string, version: string): Promise<DependencyUpdate> {
    this.logger.info(`Updating dependency ${packageName} to ${version}`);

    try {
      // Get current package info
      const packages = await this.getInstalledPackages();
      const pkg = packages.find(p => p.name === packageName);

      if (!pkg) {
        throw new Error(`Package ${packageName} not found in dependencies`);
      }

      // Fetch latest version from registry
      const registryData = await this.fetchPackageFromRegistry(packageName);
      if (!registryData) {
        throw new Error(`Failed to fetch package ${packageName} from registry`);
      }

      const updateType = this.getUpdateType(pkg.currentVersion, version);
      const vulnerabilities = await this.checkPackageVulnerabilities(pkg);
      const isSecurityUpdate = vulnerabilities.length > 0;
      const severity = isSecurityUpdate ? this.getMaxSeverity(vulnerabilities) : SecuritySeverity.INFO;

      // Create dependency update record
      const update = await this.repository.createDependencyUpdate({
        packageName,
        currentVersion: pkg.currentVersion,
        targetVersion: version,
        updateType,
        status: MaintenanceStatus.PENDING,
        severity,
        isSecurityUpdate,
        vulnerabilities: vulnerabilities.map(v => v.id),
        breakingChanges: [],
        metadata: {
          scanTime: new Date(),
        },
      });

      this.emit('dependencyUpdateRequested', { packageName, version });
      return update;

    } catch (error) {
      this.logger.error(`Failed to update dependency ${packageName}:`, error);
      throw error;
    }
  }

  /**
   * Rollback a specific dependency
   * @param packageName - Name of the package to rollback
   * @param version - Target version to rollback to
   * @returns Rollback information
   */
  async rollbackDependency(packageName: string, version: string): Promise<RollbackInfo> {
    this.logger.info(`Rolling back dependency ${packageName} to ${version}`);

    // Get current package info outside try block for error handling
    const packages = await this.getInstalledPackages();
    const pkg = packages.find(p => p.name === packageName);

    // Create rollback info (initialized here for catch block access)
    const rollbackInfo: RollbackInfo = {
      updateId: '', // No update ID for manual rollback
      packageName,
      fromVersion: pkg?.currentVersion || 'unknown',
      toVersion: pkg?.currentVersion || 'unknown', // Same as from since we're rolling back
      rollbackToVersion: version,
      status: 'in_progress',
      reason: 'Manual rollback requested',
    };
    
    try {
      if (!pkg) {
        throw new Error(`Package ${packageName} not found in dependencies`);
      }

      // Read current package.json
      const packageJson = await this.readPackageJson();
      
      // Determine if package is in dependencies or devDependencies
      const isDevDependency = packageJson.devDependencies?.[packageName] !== undefined;
      const dependencySection = isDevDependency ? 'devDependencies' : 'dependencies';

      if (!packageJson[dependencySection]) {
        packageJson[dependencySection] = {};
      }

      // Update version in package.json
      packageJson[dependencySection]![packageName] = version;

      // Write updated package.json
      await this.writePackageJson(packageJson);

      // Run npm install to restore previous version
      const { stdout, stderr } = await execAsync(`npm install ${packageName}@${version}`, {
        cwd: process.cwd(),
        timeout: 120000, // 2 minutes timeout
      });

      if (stderr) {
        this.logger.warn(`npm install warnings during rollback for ${packageName}: ${stderr}`);
      }

      rollbackInfo.status = 'completed';
      rollbackInfo.rolledBackAt = new Date();

      this.logger.info(`Successfully rolled back ${packageName} to ${version}`);
      this.emit('rollbackCompleted', rollbackInfo);

      return rollbackInfo;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to rollback dependency ${packageName}: ${errorMessage}`);
      
      // Update rollback info status to failed
      rollbackInfo.status = 'failed';
      rollbackInfo.reason = errorMessage;
      
      this.emit('rollbackFailed', { rollbackInfo, error });
      return rollbackInfo;
    }
  }

  /**
   * Analyze the impact of a dependency update
   * @param packageName - Name of the package
   * @param targetVersion - Target version to analyze
   * @returns Impact analysis result
   */
  async analyzeDependencyImpact(packageName: string, targetVersion: string): Promise<DependencyImpactAnalysis> {
    this.logger.info(`Analyzing impact of updating ${packageName} to ${targetVersion}`);

    try {
      // Get current package info
      const packages = await this.getInstalledPackages();
      const pkg = packages.find(p => p.name === packageName);

      if (!pkg) {
        throw new Error(`Package ${packageName} not found in dependencies`);
      }

      const currentVersion = pkg.currentVersion.replace(/^[~^]/, '');
      const updateType = this.getUpdateType(currentVersion, targetVersion);

      // Fetch package information from registry
      const registryData = await this.fetchPackageFromRegistry(packageName);
      if (!registryData) {
        throw new Error(`Failed to fetch package ${packageName} from registry`);
      }

      const targetVersionData = registryData.versions[targetVersion];
      const breakingChanges: string[] = [];

      // Extract breaking changes from package metadata
      if (targetVersionData?.deprecated) {
        breakingChanges.push('This version is deprecated');
      }
      
      // Analyze dependency tree from package-lock.json
      const packageLock = await this.readPackageLockJson();
      const transitiveDependencies: string[] = [];
      const affectedDependencies: string[] = [];

      if (packageLock) {
        this.collectTransitiveDependencies(packageLock, packageName, transitiveDependencies);
        affectedDependencies.push(...transitiveDependencies);
      }

      // Estimate risk based on update type and breaking changes
      let estimatedRisk: 'low' | 'medium' | 'high' | 'critical' = 'low';
      
      if (updateType === 'major') {
        estimatedRisk = breakingChanges.length > 0 ? 'critical' : 'high';
      } else if (updateType === 'minor') {
        estimatedRisk = breakingChanges.length > 0 ? 'high' : 'medium';
      } else if (updateType === 'patch') {
        estimatedRisk = breakingChanges.length > 0 ? 'medium' : 'low';
      }

      // Generate recommendations
      const recommendations: string[] = [];
      
      if (estimatedRisk === 'critical' || estimatedRisk === 'high') {
        recommendations.push('Review breaking changes carefully before proceeding');
        recommendations.push('Consider testing in a staging environment first');
      }
      
      if (updateType === 'major') {
        recommendations.push('Major version update may introduce breaking changes');
        recommendations.push('Review migration guide for this package');
      }
      
      if (transitiveDependencies.length > 5) {
        recommendations.push('This update affects many transitive dependencies');
        recommendations.push('Consider testing all dependent packages');
      }

      const analysis: DependencyImpactAnalysis = {
        packageName,
        currentVersion: pkg.currentVersion,
        targetVersion,
        updateType,
        breakingChanges,
        affectedDependencies,
        transitiveDependencies,
        estimatedRisk,
        recommendations,
      };

      this.emit('impactAnalysisCompleted', analysis);
      return analysis;

    } catch (error) {
      this.logger.error(`Failed to analyze impact for ${packageName}:`, error);
      throw error;
    }
  }

  /**
   * Check for dependency conflicts
   * @returns Array of detected conflicts
   */
  async checkDependencyConflicts(): Promise<DependencyConflict[]> {
    this.logger.info('Checking for dependency conflicts');

    const conflicts: DependencyConflict[] = [];

    try {
      // Read package.json and package-lock.json
      const packageJson = await this.readPackageJson();
      const packageLock = await this.readPackageLockJson();

      if (!packageLock) {
        this.logger.warn('package-lock.json not found, skipping conflict detection');
        return conflicts;
      }

      const allDependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      // Check for version conflicts
      const versionMap = new Map<string, string[]>();
      
      for (const [name, version] of Object.entries(allDependencies)) {
        if (!versionMap.has(name)) {
          versionMap.set(name, []);
        }
        versionMap.get(name)!.push(version);
      }

      for (const [name, versions] of versionMap) {
        if (versions.length > 1) {
          conflicts.push({
            packageName: name,
            conflictType: 'version_mismatch',
            details: `Package ${name} has multiple versions specified: ${versions.join(', ')}`,
            severity: 'error',
            affectedPackages: [name],
          });
        }
      }

      // Check for circular dependencies
      const visited = new Set<string>();
      const path: string[] = [];

      const hasCircularDependency = (
        packageName: string,
        currentPath: string[] = []
      ): boolean => {
        if (visited.has(packageName)) {
          return true;
        }
        visited.add(packageName);
        
        const deps = packageLock.dependencies?.[packageName]?.dependencies;
        if (deps) {
          for (const depName of Object.keys(deps)) {
            if (hasCircularDependency(depName, [...currentPath, packageName])) {
              return true;
            }
          }
        }
        
        return false;
      };

      for (const pkgName of Object.keys(allDependencies)) {
        if (hasCircularDependency(pkgName, [])) {
          conflicts.push({
            packageName: pkgName,
            conflictType: 'circular',
            details: `Circular dependency detected involving ${pkgName}`,
            severity: 'error',
            affectedPackages: [pkgName],
          });
        }
      }

      // Check for peer dependency conflicts
      if (packageJson.peerDependencies) {
        const installedVersions = new Set(Object.keys(allDependencies));
        
        for (const [peerName, peerVersion] of Object.entries(packageJson.peerDependencies)) {
          const peerDeps = packageLock.dependencies?.[peerName]?.requires;
          
          if (peerDeps) {
            for (const [depName, depVersion] of Object.entries(peerDeps)) {
              if (!installedVersions.has(depName)) {
                conflicts.push({
                  packageName: peerName,
                  conflictType: 'peer_dependency',
                  details: `Peer dependency ${depName}@${depVersion} required but not installed`,
                  severity: 'warning',
                  affectedPackages: [peerName, depName],
                });
              }
            }
          }
        }
      }

      // Check for duplicate packages
      const duplicateCheck = new Map<string, string[]>();
      
      const checkForDuplicates = (entry: PackageLockEntry, name: string): void => {
        if (entry.name === name && entry.version) {
          if (!duplicateCheck.has(name)) {
            duplicateCheck.set(name, []);
          }
          duplicateCheck.get(name)!.push(entry.version);
        }
        
        if (entry.dependencies) {
          for (const [depName, depEntry] of Object.entries(entry.dependencies)) {
            checkForDuplicates(depEntry, depName);
          }
        }
      };

      if (packageLock) {
        checkForDuplicates(packageLock, '');
      }

      for (const [name, versions] of duplicateCheck) {
        if (versions.length > 1) {
          conflicts.push({
            packageName: name,
            conflictType: 'duplicate',
            details: `Package ${name} appears multiple times with versions: ${versions.join(', ')}`,
            severity: 'warning',
            affectedPackages: [name],
          });
        }
      }

      this.logger.info(`Found ${conflicts.length} dependency conflicts`);
      this.emit('conflictsDetected', conflicts);

      return conflicts;

    } catch (error) {
      this.logger.error('Failed to check for dependency conflicts:', error);
      return [];
    }
  }

  /**
   * Optimize dependencies
   * @returns Optimization result with recommendations
   */
  async optimizeDependencies(): Promise<DependencyOptimizationResult> {
    this.logger.info('Optimizing dependencies');

    try {
      const packages = await this.getInstalledPackages();
      const packageLock = await this.readPackageLockJson();

      const unusedPackages: string[] = [];
      const outdatedPackages: Array<{ name: string; current: string; latest: string }> = [];
      const duplicatePackages: Array<{ name: string; versions: string[] }> = [];
      const securityVulnerabilities: Array<{ name: string; severity: SecuritySeverity }> = [];

      // Check for unused packages
      const usedPackages = new Set<string>();

      if (packageLock) {
        const collectUsedPackages = (entry: PackageLockEntry): void => {
          if (entry.name) {
            usedPackages.add(entry.name);
          }
          if (entry.dependencies) {
            for (const dep of Object.values(entry.dependencies)) {
              collectUsedPackages(dep);
            }
          }
        };

        collectUsedPackages(packageLock);
      }

      for (const pkg of packages) {
        if (!usedPackages.has(pkg.name)) {
          unusedPackages.push(pkg.name);
        }
      }

      // Check for outdated packages
      for (const pkg of packages) {
        if (this.compareVersions(pkg.latestVersion, pkg.currentVersion) > 0) {
          outdatedPackages.push({
            name: pkg.name,
            current: pkg.currentVersion,
            latest: pkg.latestVersion,
          });
        }
      }

      // Check for duplicate packages
      const versionMap = new Map<string, Set<string>>();
      
      if (packageLock) {
        const collectVersions = (entry: PackageLockEntry, name: string): void => {
          if (entry.name === name && entry.version) {
            if (!versionMap.has(name)) {
              versionMap.set(name, new Set());
            }
            versionMap.get(name)!.add(entry.version);
          }
          
          if (entry.dependencies) {
            for (const [depName, depEntry] of Object.entries(entry.dependencies)) {
              collectVersions(depEntry, depName);
            }
          }
        };

        collectVersions(packageLock, '');
      }

      for (const [name, versions] of versionMap) {
        if (versions.size > 1) {
          duplicatePackages.push({
            name,
            versions: Array.from(versions),
          });
        }
      }

      // Check for security vulnerabilities
      for (const pkg of packages) {
        const vulnerabilities = await this.checkPackageVulnerabilities(pkg);
        
        if (vulnerabilities.length > 0) {
          const maxSeverity = this.getMaxSeverity(vulnerabilities);
          
          securityVulnerabilities.push({
            name: pkg.name,
            severity: maxSeverity,
          });
        }
      }

      // Calculate estimated size reduction (rough estimate)
      const estimatedSizeReduction = unusedPackages.length * 2; // 2MB per unused package

      // Generate recommendations
      const recommendations: string[] = [];
      
      if (unusedPackages.length > 0) {
        recommendations.push(`Remove ${unusedPackages.length} unused packages to reduce bundle size`);
      }
      
      if (outdatedPackages.length > 0) {
        recommendations.push(`Update ${outdatedPackages.length} outdated packages to get latest features and security patches`);
      }
      
      if (duplicatePackages.length > 0) {
        recommendations.push(`Resolve ${duplicatePackages.length} duplicate package conflicts`);
      }
      
      if (securityVulnerabilities.length > 0) {
        const criticalVulns = securityVulnerabilities.filter(v => v.severity === SecuritySeverity.CRITICAL);
        if (criticalVulns.length > 0) {
          recommendations.push(`Immediately address ${criticalVulns.length} critical security vulnerabilities`);
        }
      }

      recommendations.push('Run npm prune to remove unnecessary dependencies');
      recommendations.push('Use npm ci for consistent builds');
      recommendations.push('Enable automated dependency updates for security patches');

      const result: DependencyOptimizationResult = {
        totalPackages: packages.length,
        unusedPackages,
        outdatedPackages,
        duplicatePackages,
        securityVulnerabilities,
        estimatedSizeReduction,
        recommendations,
      };

      this.logger.info(`Dependency optimization completed: ${JSON.stringify({
        totalPackages: result.totalPackages,
        unusedPackages: result.unusedPackages.length,
        outdatedPackages: result.outdatedPackages.length,
        duplicatePackages: result.duplicatePackages.length,
        securityVulnerabilities: result.securityVulnerabilities.length,
        estimatedSizeReduction: result.estimatedSizeReduction,
      })}`);
      this.emit('optimizationCompleted', result);

      return result;

    } catch (error) {
      this.logger.error('Failed to optimize dependencies:', error);
      throw error;
    }
  }

  /**
   * Check if manager is running
   * @returns True if running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}
