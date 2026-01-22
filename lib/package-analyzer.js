const fs = require('fs-extra');
const path = require('path');

class PackageAnalyzer {
  constructor() {
    this.packageFiles = ['package.json', 'package-lock.json', 'pnpm-lock.yaml'];
  }

  async analyzeDependencies(projectPath = process.cwd()) {
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    if (!await fs.pathExists(packageJsonPath)) {
      throw new Error('package.json not found in the current directory');
    }

    const packageJson = await fs.readJson(packageJsonPath);
    const dependencies = this.extractDependencies(packageJson);
    
    return {
      path: projectPath,
      packageJson,
      dependencies
    };
  }

  extractDependencies(packageJson) {
    const deps = {
      dependencies: packageJson.dependencies || {},
      devDependencies: packageJson.devDependencies || {},
      peerDependencies: packageJson.peerDependencies || {},
      optionalDependencies: packageJson.optionalDependencies || {}
    };

    // Combine all dependencies with their type
    const allDeps = {};
    
    Object.entries(deps.dependencies).forEach(([name, version]) => {
      allDeps[name] = { version, type: 'production' };
    });
    
    Object.entries(deps.devDependencies).forEach(([name, version]) => {
      allDeps[name] = { version, type: 'development' };
    });
    
    Object.entries(deps.peerDependencies).forEach(([name, version]) => {
      allDeps[name] = { version, type: 'peer' };
    });
    
    Object.entries(deps.optionalDependencies).forEach(([name, version]) => {
      allDeps[name] = { version, type: 'optional' };
    });

    return allDeps;
  }

  async getLockFileData(projectPath = process.cwd()) {
    const lockFiles = [];
    
    for (const filename of this.packageFiles) {
      const filePath = path.join(projectPath, filename);
      if (await fs.pathExists(filePath)) {
        lockFiles.push({
          name: filename,
          path: filePath,
          exists: true
        });
      }
    }

    return lockFiles;
  }

  filterDependencies(dependencies, options = {}) {
    let filtered = { ...dependencies };

    if (options.excludeDev) {
      filtered = Object.fromEntries(
        Object.entries(filtered).filter(([_, dep]) => dep.type !== 'development')
      );
    }

    if (options.excludePeer) {
      filtered = Object.fromEntries(
        Object.entries(filtered).filter(([_, dep]) => dep.type !== 'peer')
      );
    }

    if (options.excludeOptional) {
      filtered = Object.fromEntries(
        Object.entries(filtered).filter(([_, dep]) => dep.type !== 'optional')
      );
    }

    if (options.onlyProduction) {
      filtered = Object.fromEntries(
        Object.entries(filtered).filter(([_, dep]) => dep.type === 'production')
      );
    }

    return filtered;
  }

  async getDependencyCount(dependencies) {
    const counts = {
      total: Object.keys(dependencies).length,
      production: 0,
      development: 0,
      peer: 0,
      optional: 0
    };

    Object.values(dependencies).forEach(dep => {
      counts[dep.type]++;
    });

    return counts;
  }
}

module.exports = PackageAnalyzer;
