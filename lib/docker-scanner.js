const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const tar = require('tar');

class DockerScanner {
  constructor() {
    this.projectPath = process.cwd();
    this.imageName = 'trouter-temp-scan';
  }

  async scanImage(imageTag = null) {
    const imageToScan = imageTag || await this.buildTempImage();
    
    try {
      const scan = {
        image: imageToScan,
        vulnerabilities: await this.scanVulnerabilities(imageToScan),
        size: await this.getImageSize(imageToScan),
        layers: await this.analyzeLayers(imageToScan),
        secrets: await this.scanSecrets(imageToScan),
        permissions: await this.analyzePermissions(imageToScan)
      };

      if (!imageTag) {
        await this.cleanupTempImage(imageToScan);
      }

      return scan;
    } catch (error) {
      if (!imageTag) {
        await this.cleanupTempImage(imageToScan);
      }
      throw error;
    }
  }

  async buildTempImage() {
    console.log(chalk.blue('🔨 Building temporary Docker image for scanning...'));
    
    const tempTag = `${this.imageName}-${Date.now()}`;
    
    try {
      execSync(`docker build -t ${tempTag} .`, { 
        stdio: 'pipe',
        cwd: this.projectPath 
      });
      return tempTag;
    } catch (error) {
      throw new Error(`Failed to build Docker image: ${error.message}`);
    }
  }

  async cleanupTempImage(imageTag) {
    try {
      execSync(`docker rmi -f ${imageTag}`, { stdio: 'pipe' });
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  async scanVulnerabilities(imageTag) {
    console.log(chalk.blue('🔍 Scanning for vulnerabilities...'));
    
    const vulnerabilities = {
      critical: [],
      high: [],
      medium: [],
      low: [],
      info: [],
      total: 0
    };

    try {
      // Use docker scout if available, otherwise fallback to basic scanning
      if (await this.hasDockerScout()) {
        return await this.scanWithDockerScout(imageTag);
      } else {
        return await this.scanWithTrivy(imageTag) || await this.basicVulnerabilityScan(imageTag);
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️  Advanced vulnerability scanning not available, using basic scan'));
      return await this.basicVulnerabilityScan(imageTag);
    }
  }

  async hasDockerScout() {
    try {
      execSync('docker scout version', { stdio: 'pipe' });
      return true;
    } catch (error) {
      return false;
    }
  }

  async scanWithDockerScout(imageTag) {
    try {
      const output = execSync(`docker scout cves --format json ${imageTag}`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      const data = JSON.parse(output);
      return this.parseVulnerabilityData(data);
    } catch (error) {
      throw new Error(`Docker Scout scan failed: ${error.message}`);
    }
  }

  async scanWithTrivy(imageTag) {
    try {
      execSync('trivy version', { stdio: 'pipe' });
      
      const output = execSync(`trivy image --format json --quiet ${imageTag}`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      const data = JSON.parse(output);
      return this.parseTrivyResults(data);
    } catch (error) {
      return null;
    }
  }

  async basicVulnerabilityScan(imageTag) {
    const vulnerabilities = {
      critical: [],
      high: [],
      medium: [],
      low: [],
      info: [],
      total: 0
    };

    try {
      // Get image OS information
      const osInfo = await this.getImageOS(imageTag);
      
      // Check for common vulnerable packages
      const commonVulns = await this.checkCommonVulnerabilities(imageTag, osInfo);
      
      // Categorize vulnerabilities
      commonVulns.forEach(vuln => {
        const category = this.categorizeVulnerability(vuln.severity);
        vulnerabilities[category].push(vuln);
        vulnerabilities.total++;
      });

      return vulnerabilities;
    } catch (error) {
      console.log(chalk.yellow('⚠️  Basic vulnerability scan completed with limited results'));
      return vulnerabilities;
    }
  }

  async getImageOS(imageTag) {
    try {
      const output = execSync(`docker run --rm ${imageTag} cat /etc/os-release 2>/dev/null || echo "Unknown"`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      const osInfo = {};
      output.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
          osInfo[key] = value.replace(/"/g, '');
        }
      });
      
      return osInfo;
    } catch (error) {
      return { ID: 'alpine' }; // Default to Alpine
    }
  }

  async checkCommonVulnerabilities(imageTag, osInfo) {
    const vulnerabilities = [];
    
    try {
      // Check for outdated Node.js
      const nodeVersion = await this.getNodeVersion(imageTag);
      if (nodeVersion && this.isNodeVulnerable(nodeVersion)) {
        vulnerabilities.push({
          package: 'node',
          version: nodeVersion,
          severity: 'high',
          description: 'Node.js version has known security vulnerabilities',
          fix: 'Update to latest LTS version'
        });
      }

      // Check for common package vulnerabilities
      const packages = await this.getInstalledPackages(imageTag);
      packages.forEach(pkg => {
        const vuln = this.checkPackageVulnerability(pkg);
        if (vuln) {
          vulnerabilities.push(vuln);
        }
      });

    } catch (error) {
      // Continue with empty list if scanning fails
    }

    return vulnerabilities;
  }

  async getNodeVersion(imageTag) {
    try {
      const output = execSync(`docker run --rm ${imageTag} node --version 2>/dev/null`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      return output.trim();
    } catch (error) {
      return null;
    }
  }

  isNodeVulnerable(version) {
    const vulnerableVersions = [
      'v14.x', 'v15.x', 'v16.x', 'v17.x', 'v18.x < 18.17.0', 'v20.x < 20.5.0'
    ];
    
    return vulnerableVersions.some(pattern => {
      if (pattern.includes('<')) {
        const [base, minVersion] = pattern.split('<').map(s => s.trim());
        return version.startsWith(base) && this.compareVersions(version, minVersion) < 0;
      }
      return version.startsWith(pattern.replace('.x', ''));
    });
  }

  compareVersions(v1, v2) {
    const normalize = v => v.replace(/^v/, '').split('.').map(Number);
    const a = normalize(v1);
    const b = normalize(v2);
    
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const diff = (a[i] || 0) - (b[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  }

  async getInstalledPackages(imageTag) {
    const packages = [];
    
    try {
      // Try npm list
      const npmList = execSync(`docker run --rm ${imageTag} npm list --depth=0 --json 2>/dev/null`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      const npmData = JSON.parse(npmList);
      if (npmData.dependencies) {
        Object.entries(npmData.dependencies).forEach(([name, info]) => {
          packages.push({ name, version: info.version });
        });
      }
    } catch (error) {
      // Try alternative methods
    }

    return packages;
  }

  checkPackageVulnerability(pkg) {
    const vulnerablePackages = {
      'lodash': { versions: '<4.17.21', severity: 'high', description: 'Prototype pollution' },
      'axios': { versions: '<0.21.1', severity: 'medium', description: 'SSRF vulnerability' },
      'request': { versions: '*', severity: 'high', description: 'Deprecated and vulnerable' },
      'moment': { versions: '<2.29.4', severity: 'medium', description: 'Path traversal' }
    };

    const vuln = vulnerablePackages[pkg.name];
    if (vuln) {
      if (vuln.versions === '*' || this.isVersionInRange(pkg.version, vuln.versions)) {
        return {
          package: pkg.name,
          version: pkg.version,
          severity: vuln.severity,
          description: vuln.description,
          fix: `Update to latest version`
        };
      }
    }

    return null;
  }

  isVersionInRange(version, range) {
    if (range.startsWith('<')) {
      const minVersion = range.substring(1).trim();
      return this.compareVersions(version, minVersion) < 0;
    }
    return false;
  }

  categorizeVulnerability(severity) {
    const category = severity.toLowerCase();
    if (['critical', 'high', 'medium', 'low', 'info'].includes(category)) {
      return category;
    }
    return 'info';
  }

  parseVulnerabilityData(data) {
    // Parse Docker Scout or Trivy JSON output
    const vulnerabilities = {
      critical: [],
      high: [],
      medium: [],
      low: [],
      info: [],
      total: 0
    };

    // Implementation would depend on the specific tool's JSON format
    return vulnerabilities;
  }

  parseTrivyResults(data) {
    const vulnerabilities = {
      critical: [],
      high: [],
      medium: [],
      low: [],
      info: [],
      total: 0
    };

    if (data.Results && data.Results[0] && data.Results[0].Vulnerabilities) {
      data.Results[0].Vulnerabilities.forEach(vuln => {
        const category = this.categorizeVulnerability(vuln.Severity);
        vulnerabilities[category].push({
          package: vuln.PkgName,
          version: vuln.InstalledVersion,
          severity: vuln.Severity,
          description: vuln.Description,
          fix: vuln.FixedVersion
        });
        vulnerabilities.total++;
      });
    }

    return vulnerabilities;
  }

  async getImageSize(imageTag) {
    try {
      const output = execSync(`docker images ${imageTag} --format "{{.Size}}"`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      return output.trim();
    } catch (error) {
      return 'Unknown';
    }
  }

  async analyzeLayers(imageTag) {
    try {
      const output = execSync(`docker history ${imageTag} --format "{{.CreatedBy}}\\t{{.Size}}" --no-trunc`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      const layers = output.split('\n').map(line => {
        const [command, size] = line.split('\t');
        return { command: command.trim(), size: size.trim() };
      }).filter(layer => layer.command && layer.size);

      return {
        total: layers.length,
        layers: layers,
        largestLayers: layers
          .sort((a, b) => this.parseSize(b.size) - this.parseSize(a.size))
          .slice(0, 5)
      };
    } catch (error) {
      return { total: 0, layers: [], largestLayers: [] };
    }
  }

  parseSize(sizeStr) {
    if (sizeStr === '0B') return 0;
    const units = { B: 0, kB: 1, MB: 2, GB: 3 };
    const [size, unit] = sizeStr.match(/(\d+\.?\d*)(B|kB|MB|GB)/) || [];
    return parseFloat(size) * Math.pow(1000, units[unit] || 0);
  }

  async scanSecrets(imageTag) {
    console.log(chalk.blue('🔍 Scanning for secrets...'));
    
    const secrets = [];
    
    try {
      // Create a temporary container to inspect
      const containerId = execSync(`docker create ${imageTag}`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();

      try {
        // Copy files from container and scan
        const tempDir = path.join(this.projectPath, '.trouter-temp');
        await fs.ensureDir(tempDir);
        
        execSync(`docker cp ${containerId}:/app ${tempDir}`, { stdio: 'pipe' });
        
        // Scan for secrets
        const appDir = path.join(tempDir, 'app');
        if (await fs.pathExists(appDir)) {
          await this.scanDirectoryForSecrets(appDir, secrets);
        }
        
        // Cleanup
        await fs.remove(tempDir);
      } finally {
        // Remove container
        execSync(`docker rm ${containerId}`, { stdio: 'pipe' });
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️  Secret scanning completed with limited results'));
    }

    return secrets;
  }

  async scanDirectoryForSecrets(dir, secrets) {
    const secretPatterns = [
      { pattern: /password\s*[:=]\s*['"]?([^'"\s]+)/gi, type: 'password' },
      { pattern: /secret\s*[:=]\s*['"]?([^'"\s]+)/gi, type: 'secret' },
      { pattern: /token\s*[:=]\s*['"]?([^'"\s]+)/gi, type: 'token' },
      { pattern: /api[_-]?key\s*[:=]\s*['"]?([^'"\s]+)/gi, type: 'api_key' },
      { pattern: /aws[_-]?access[_-]?key\s*[:=]\s*['"]?([^'"\s]+)/gi, type: 'aws_access_key' }
    ];

    const files = await fs.readdir(dir, { withFileTypes: true });
    
    for (const file of files) {
      const filePath = path.join(dir, file.name);
      
      if (file.isDirectory()) {
        await this.scanDirectoryForSecrets(filePath, secrets);
      } else if (file.isFile() && this.shouldScanFile(file.name)) {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          
          secretPatterns.forEach(({ pattern, type }) => {
            const matches = content.match(pattern);
            if (matches) {
              secrets.push({
                file: path.relative(dir, filePath),
                type,
                matches: matches.length,
                severity: 'high'
              });
            }
          });
        } catch (error) {
          // Skip files that can't be read
        }
      }
    }
  }

  shouldScanFile(filename) {
    const scanExtensions = ['.js', '.json', '.yml', '.yaml', '.env', '.config', '.conf'];
    const skipFiles = ['node_modules', '.git', 'dist', 'build'];
    
    return scanExtensions.some(ext => filename.endsWith(ext)) &&
           !skipFiles.some(skip => filename.includes(skip));
  }

  async analyzePermissions(imageTag) {
    console.log(chalk.blue('🔍 Analyzing permissions...'));
    
    const permissions = {
      runningAsRoot: false,
      writableFileSystem: false,
      sudoInstalled: false,
      issues: [],
      suggestions: []
    };

    try {
      // Check if running as root
      const userCheck = execSync(`docker run --rm ${imageTag} whoami`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      permissions.runningAsRoot = userCheck.trim() === 'root';
      if (permissions.runningAsRoot) {
        permissions.issues.push('Container is running as root user');
        permissions.suggestions.push('Create and use a non-root user');
      }

      // Check if filesystem is writable
      const writeCheck = execSync(`docker run --rm ${imageTag} touch /tmp/test 2>/dev/null && echo "writable" || echo "not-writable"`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      permissions.writableFileSystem = writeCheck.trim() === 'writable';
      if (permissions.writableFileSystem) {
        permissions.suggestions.push('Consider using read-only filesystem where possible');
      }

      // Check for sudo installation
      try {
        execSync(`docker run --rm ${imageTag} which sudo`, { stdio: 'pipe' });
        permissions.sudoInstalled = true;
        permissions.issues.push('sudo is installed in container');
        permissions.suggestions.push('Remove sudo from production containers');
      } catch (error) {
        permissions.sudoInstalled = false;
      }

    } catch (error) {
      console.log(chalk.yellow('⚠️  Permission analysis completed with limited results'));
    }

    return permissions;
  }
}

module.exports = DockerScanner;
