const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const which = require('which');
const chalk = require('chalk');

class DockerAnalyzer {
  constructor() {
    this.projectPath = process.cwd();
    this.dockerfilePath = path.join(this.projectPath, 'Dockerfile');
  }

  async checkDockerInstallation() {
    try {
      which.sync('docker');
      return true;
    } catch (error) {
      throw new Error('Docker is not installed or not in PATH. Please install Docker first.');
    }
  }

  async analyzeDockerfile() {
    if (!await fs.pathExists(this.dockerfilePath)) {
      throw new Error('No Dockerfile found in the current directory');
    }

    const content = await fs.readFile(this.dockerfilePath, 'utf8');
    const lines = content.split(/\r?\n/).filter(line => line.trim()); // Filter empty lines
    
    const analysis = {
      lines: lines.length,
      stages: this.detectStages(lines),
      baseImage: this.extractBaseImage(lines),
      nodeVersion: this.extractNodeVersion(lines),
      packageManager: this.detectPackageManager(lines),
      optimizations: this.analyzeOptimizations(lines),
      security: this.analyzeSecurity(lines),
      size: this.analyzeSize(lines),
      performance: this.analyzePerformance(lines)
    };

    return analysis;
  }

  detectStages(lines) {
    const stages = [];
    let currentStage = null;
    
    lines.forEach((line, index) => {
      const fromMatch = line.match(/^FROM\s+(.+?)(?:\s+AS\s+(.+))?$/i);
      if (fromMatch) {
        currentStage = {
          line: index + 1,
          image: fromMatch[1],
          name: fromMatch[2] || `stage-${stages.length + 1}`,
          instructions: []
        };
        stages.push(currentStage);
      } else if (currentStage && line.trim()) {
        currentStage.instructions.push({ line: index + 1, content: line });
      }
    });

    return stages;
  }

  extractBaseImage(lines) {
    for (const line of lines) {
      const match = line.match(/^FROM\s+(.+?)(?:\s+AS|$)/i);
      if (match) {
        return match[1].trim();
      }
    }
    return null;
  }

  extractNodeVersion(lines) {
    for (const line of lines) {
      const nodeMatch = line.match(/FROM\s+node:(\d+(?:\.\d+)?)/i);
      if (nodeMatch) {
        return nodeMatch[1];
      }
    }
    return null;
  }

  detectPackageManager(lines) {
    const packageCommands = {
      'npm': ['npm install', 'npm ci', 'npm run'],
      'yarn': ['yarn install', 'yarn add', 'yarn run'],
      'pnpm': ['pnpm install', 'pnpm add', 'pnpm run']
    };

    for (const line of lines) {
      for (const [pm, commands] of Object.entries(packageCommands)) {
        if (commands.some(cmd => line.includes(cmd))) {
          return pm;
        }
      }
    }
    return 'npm'; // default
  }

  analyzeOptimizations(lines) {
    const optimizations = {
      hasMultiStage: false,
      hasPackageCache: false,
      hasDockerignore: false,
      hasMinimizedLayers: false,
      hasAlpineBase: false,
      hasProductionFlag: false,
      issues: [],
      suggestions: []
    };

    // Check for multi-stage builds
    const fromCount = lines.filter(line => line.match(/^FROM\s+/i)).length;
    optimizations.hasMultiStage = fromCount > 1;
    if (!optimizations.hasMultiStage) {
      optimizations.suggestions.push('Consider using multi-stage builds to reduce final image size');
    }

    // Check for package.json copying optimization
    let hasPackageJsonCopy = false;
    let hasPackageInstall = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('package.json') && line.includes('COPY')) {
        hasPackageJsonCopy = true;
      }
      if (line.includes('npm install') || line.includes('yarn install') || line.includes('pnpm install')) {
        hasPackageInstall = true;
      }
    }
    
    optimizations.hasPackageCache = hasPackageJsonCopy && hasPackageInstall;
    if (!optimizations.hasPackageCache) {
      optimizations.suggestions.push('Copy package.json first, install dependencies, then copy source code for better layer caching');
    }

    // Check for .dockerignore
    optimizations.hasDockerignore = fs.pathExistsSync(path.join(this.projectPath, '.dockerignore'));
    if (!optimizations.hasDockerignore) {
      optimizations.suggestions.push('Create a .dockerignore file to exclude unnecessary files');
    }

    // Check for Alpine base image
    const baseImage = this.extractBaseImage(lines);
    optimizations.hasAlpineBase = baseImage && baseImage.includes('alpine');
    if (!optimizations.hasAlpineBase) {
      optimizations.suggestions.push('Consider using Alpine-based images for smaller size');
    }

    // Check for production flag
    optimizations.hasProductionFlag = lines.some(line => 
      line.includes('--production') || line.includes('--only=production')
    );
    if (!optimizations.hasProductionFlag) {
      optimizations.suggestions.push('Use --production flag when installing dependencies');
    }

    // Check for layer minimization
    const copyCount = lines.filter(line => line.match(/^COPY\s+/i)).length;
    const runCount = lines.filter(line => line.match(/^RUN\s+/i)).length;
    optimizations.hasMinimizedLayers = copyCount <= 3 && runCount <= 5;
    if (!optimizations.hasMinimizedLayers) {
      optimizations.suggestions.push('Combine RUN commands to reduce layers');
    }

    return optimizations;
  }

  analyzeSecurity(lines) {
    const security = {
      hasRootUser: false,
      hasSensitiveData: false,
      hasUpdatedPackages: false,
      hasHttpsBase: false,
      issues: [],
      suggestions: []
    };

    // Check for root user usage
    for (const line of lines) {
      if (line.match(/^USER\s+(?:root|0)/i)) {
        security.hasRootUser = true;
        security.issues.push('Running as root user is not recommended');
      }
    }

    // Check for sensitive data exposure
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /key/i,
      /credential/i
    ];

    for (const line of lines) {
      if (sensitivePatterns.some(pattern => pattern.test(line))) {
        security.hasSensitiveData = true;
        security.issues.push('Potential sensitive data exposure in Dockerfile');
        break;
      }
    }

    // Check for package updates
    security.hasUpdatedPackages = lines.some(line => 
      line.includes('apt-get update') || line.includes('apk update')
    );
    if (!security.hasUpdatedPackages) {
      security.suggestions.push('Update package lists before installing packages');
    }

    // Check for HTTPS in FROM
    const baseImage = this.extractBaseImage(lines);
    security.hasHttpsBase = baseImage && !baseImage.startsWith('http:');
    if (!security.hasHttpsBase) {
      security.issues.push('Base image should use HTTPS');
    }

    return security;
  }

  analyzeSize(lines) {
    const size = {
      estimatedSize: 'Unknown',
      largePackages: [],
      optimizationPotential: 'Medium',
      suggestions: []
    };

    // Estimate size based on common patterns
    let sizeFactors = 0;

    if (lines.some(line => line.includes('node:'))) {
      sizeFactors += 800; // Node.js base image ~800MB
    }

    if (lines.some(line => line.includes('ubuntu') || line.includes('debian'))) {
      sizeFactors += 600; // Ubuntu/Debian base ~600MB
    }

    if (lines.some(line => line.includes('alpine'))) {
      sizeFactors += 50; // Alpine base ~50MB
    }

    if (lines.some(line => line.includes('npm install') || line.includes('yarn install'))) {
      sizeFactors += 200; // Dependencies ~200MB average
    }

    if (lines.some(line => line.includes('COPY') && line.includes('.'))) {
      sizeFactors += 100; // Source code ~100MB average
    }

    // Estimate final size
    if (sizeFactors > 1000) {
      size.estimatedSize = 'Large (>1GB)';
      size.optimizationPotential = 'High';
    } else if (sizeFactors > 500) {
      size.estimatedSize = 'Medium (500MB-1GB)';
      size.optimizationPotential = 'Medium';
    } else {
      size.estimatedSize = 'Small (<500MB)';
      size.optimizationPotential = 'Low';
    }

    // Size optimization suggestions
    if (sizeFactors > 500) {
      size.suggestions.push('Consider using multi-stage builds');
      size.suggestions.push('Use Alpine-based images when possible');
      size.suggestions.push('Remove development dependencies in production');
    }

    return size;
  }

  analyzePerformance(lines) {
    const performance = {
      hasStartupOptimization: false,
      hasHealthCheck: false,
      hasResourceLimits: false,
      estimatedStartupTime: 'Medium',
      suggestions: []
    };

    // Check for startup optimizations
    performance.hasStartupOptimization = lines.some(line => 
      line.includes('npm ci') || 
      line.includes('yarn install --frozen-lockfile') ||
      line.includes('pnpm install --frozen-lockfile')
    );

    // Check for health check
    performance.hasHealthCheck = lines.some(line => line.match(/^HEALTHCHECK\s+/i));
    if (!performance.hasHealthCheck) {
      performance.suggestions.push('Add HEALTHCHECK instruction for better monitoring');
    }

    // Check for resource limits (in docker-compose or k8s files)
    const dockerComposePath = path.join(this.projectPath, 'docker-compose.yml');
    if (fs.pathExistsSync(dockerComposePath)) {
      const composeContent = fs.readFileSync(dockerComposePath, 'utf8');
      performance.hasResourceLimits = composeContent.includes('deploy:') && 
        (composeContent.includes('limits:') || composeContent.includes('reservations:'));
    }

    // Estimate startup time based on patterns
    let startupFactors = 0;
    if (lines.some(line => line.includes('npm install'))) startupFactors += 2;
    if (lines.some(line => line.includes('npm run build'))) startupFactors += 1;
    if (lines.some(line => line.includes('apt-get install'))) startupFactors += 2;

    if (startupFactors >= 3) {
      performance.estimatedStartupTime = 'Slow (>30s)';
      performance.suggestions.push('Use multi-stage builds to improve startup time');
    } else if (startupFactors >= 1) {
      performance.estimatedStartupTime = 'Medium (10-30s)';
    } else {
      performance.estimatedStartupTime = 'Fast (<10s)';
    }

    return performance;
  }

  async generateOptimizedDockerfile() {
    const analysis = await this.analyzeDockerfile();
    const packageJsonPath = path.join(this.projectPath, 'package.json');
    
    let packageManager = 'npm';
    let hasDevDependencies = false;
    
    if (await fs.pathExists(packageJsonPath)) {
      const packageJson = await fs.readJson(packageJsonPath);
      packageManager = this.detectPackageManager(['']); // Use default detection
      hasDevDependencies = !!(packageJson.devDependencies && Object.keys(packageJson.devDependencies).length > 0);
    }

    const optimized = this.createOptimizedDockerfile(analysis, packageManager, hasDevDependencies);
    return optimized;
  }

  createOptimizedDockerfile(analysis, packageManager, hasDevDependencies) {
    const nodeVersion = analysis.nodeVersion || '18';
    const pmCommands = {
      'npm': {
        install: 'npm ci',
        production: 'npm ci --only=production',
        cache: 'COPY package*.json ./'
      },
      'yarn': {
        install: 'yarn install --frozen-lockfile',
        production: 'yarn install --production --frozen-lockfile',
        cache: 'COPY package*.json yarn.lock ./'
      },
      'pnpm': {
        install: 'pnpm install --frozen-lockfile',
        production: 'pnpm install --prod --frozen-lockfile',
        cache: 'COPY package*.json pnpm-lock.yaml ./'
      }
    };

    const pm = pmCommands[packageManager] || pmCommands.npm;

    let dockerfile = `# Multi-stage build for production optimization
FROM node:${nodeVersion}-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

${pm.cache}
WORKDIR /app
${pm.install}

# Copy source code and build
COPY . .
RUN npm run build

# Production stage
FROM node:${nodeVersion}-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

WORKDIR /app

${pm.cache}
${pm.production}

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Change to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:3000/ || exit 1

# Start application
CMD ["node", "dist/index.js"]`;

    return dockerfile;
  }

  async generateDockerignore() {
    const dockerignoreContent = `# Dependencies
node_modules
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage
*.lcov

# nyc test coverage
.nyc_output

# Grunt intermediate storage
.grunt

# Bower dependency directory
bower_components

# node-waf configuration
.lock-wscript

# Compiled binary addons
build/Release

# Dependency directories
jspm_packages/

# TypeScript cache
*.tsbuildinfo

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Microbundle cache
.rpt2_cache/
.rts2_cache_cjs/
.rts2_cache_es/
.rts2_cache_umd/

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env
.env.test
.env.local
.env.production

# parcel-bundler cache
.cache
.parcel-cache

# Next.js build output
.next

# Nuxt.js build / generate output
.nuxt
dist

# Gatsby files
.cache/
public

# Storybook build outputs
.out
.storybook-out

# Temporary folders
tmp/
temp/

# Logs
logs
*.log

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# IDE
.vscode
.idea
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Git
.git
.gitignore

# Docker
Dockerfile
docker-compose.yml
.dockerignore`;

    return dockerignoreContent;
  }
}

module.exports = DockerAnalyzer;
