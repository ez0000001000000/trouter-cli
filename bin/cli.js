#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const Table = require('cli-table3');
const path = require('path');
const fs = require('fs-extra');
const DockerAnalyzer = require('../lib/docker-analyzer');
const DockerScanner = require('../lib/docker-scanner');
const DockerPerformance = require('../lib/docker-performance');

const program = new Command();

program
  .name('trouter-cli')
  .description('A comprehensive CLI tool for Docker optimization and analysis')
  .version('1.0.1');

// Docker commands
const dockerCommand = program
  .command('docker')
  .description('Docker optimization and analysis commands');

dockerCommand
  .command('analyze')
  .description('Analyze Dockerfile for optimization opportunities')
  .option('-p, --path <path>', 'Path to project directory', process.cwd())
  .option('--json', 'Output results as JSON', false)
  .action(async (options) => {
    try {
      const analyzer = new DockerAnalyzer();
      
      await analyzer.checkDockerInstallation();
      
      console.log(chalk.blue('🔍 Analyzing Dockerfile...'));
      
      const analysis = await analyzer.analyzeDockerfile();

      if (options.json) {
        console.log(JSON.stringify(analysis, null, 2));
        return;
      }

      console.log(chalk.bold('\n📋 Dockerfile Analysis'));
      
      // Basic info
      console.log(chalk.bold('\n📊 Basic Information:'));
      console.log(`• Lines: ${analysis.lines}`);
      console.log(`• Base Image: ${analysis.baseImage}`);
      console.log(`• Node Version: ${analysis.nodeVersion || 'Not detected'}`);
      console.log(`• Package Manager: ${analysis.packageManager}`);
      console.log(`• Stages: ${analysis.stages.length}`);

      // Optimization analysis
      console.log(chalk.bold('\n⚡ Optimization Analysis:'));
      const opt = analysis.optimizations;
      console.log(`• Multi-stage Build: ${opt.hasMultiStage ? '✅' : '❌'}`);
      console.log(`• Package Cache: ${opt.hasPackageCache ? '✅' : '❌'}`);
      console.log(`• .dockerignore: ${opt.hasDockerignore ? '✅' : '❌'}`);
      console.log(`• Alpine Base: ${opt.hasAlpineBase ? '✅' : '❌'}`);
      console.log(`• Production Flag: ${opt.hasProductionFlag ? '✅' : '❌'}`);

      if (opt.suggestions.length > 0) {
        console.log(chalk.bold.yellow('\n💡 Optimization Suggestions:'));
        opt.suggestions.forEach(suggestion => {
          console.log(chalk.yellow(`• ${suggestion}`));
        });
      }

      // Security analysis
      console.log(chalk.bold('\n🔒 Security Analysis:'));
      const sec = analysis.security;
      console.log(`• Root User: ${sec.hasRootUser ? '❌' : '✅'}`);
      console.log(`• HTTPS Base: ${sec.hasHttpsBase ? '✅' : '❌'}`);
      console.log(`• Updated Packages: ${sec.hasUpdatedPackages ? '✅' : '❌'}`);

      if (sec.issues.length > 0) {
        console.log(chalk.bold.red('\n⚠️ Security Issues:'));
        sec.issues.forEach(issue => {
          console.log(chalk.red(`• ${issue}`));
        });
      }

      if (sec.suggestions.length > 0) {
        console.log(chalk.bold.yellow('\n💡 Security Suggestions:'));
        sec.suggestions.forEach(suggestion => {
          console.log(chalk.yellow(`• ${suggestion}`));
        });
      }

      // Size analysis
      console.log(chalk.bold('\n📏 Size Analysis:'));
      const size = analysis.size;
      console.log(`• Estimated Size: ${size.estimatedSize}`);
      console.log(`• Optimization Potential: ${size.optimizationPotential}`);

      if (size.suggestions.length > 0) {
        console.log(chalk.bold.yellow('\n💡 Size Optimization Suggestions:'));
        size.suggestions.forEach(suggestion => {
          console.log(chalk.yellow(`• ${suggestion}`));
        });
      }

      // Performance analysis
      console.log(chalk.bold('\n⚡ Performance Analysis:'));
      const perf = analysis.performance;
      console.log(`• Startup Optimization: ${perf.hasStartupOptimization ? '✅' : '❌'}`);
      console.log(`• Health Check: ${perf.hasHealthCheck ? '✅' : '❌'}`);
      console.log(`• Resource Limits: ${perf.hasResourceLimits ? '✅' : '❌'}`);
      console.log(`• Estimated Startup: ${perf.estimatedStartupTime}`);

      if (perf.suggestions.length > 0) {
        console.log(chalk.bold.yellow('\n💡 Performance Suggestions:'));
        perf.suggestions.forEach(suggestion => {
          console.log(chalk.yellow(`• ${suggestion}`));
        });
      }

    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

dockerCommand
  .command('optimize')
  .description('Generate optimized Dockerfile and .dockerignore')
  .option('-p, --path <path>', 'Path to project directory', process.cwd())
  .option('--force', 'Overwrite existing files', false)
  .action(async (options) => {
    try {
      const analyzer = new DockerAnalyzer();
      
      await analyzer.checkDockerInstallation();
      
      console.log(chalk.blue('🔧 Generating optimized Docker configuration...'));
      
      // Generate optimized Dockerfile
      const optimizedDockerfile = await analyzer.generateOptimizedDockerfile();
      const dockerfilePath = path.join(options.path, 'Dockerfile.optimized');
      
      if (await fs.pathExists(dockerfilePath) && !options.force) {
        console.log(chalk.yellow('⚠️  Optimized Dockerfile already exists. Use --force to overwrite.'));
      } else {
        await fs.writeFile(dockerfilePath, optimizedDockerfile);
        console.log(chalk.green(`✅ Generated optimized Dockerfile: ${dockerfilePath}`));
      }

      // Generate .dockerignore
      const dockerignore = await analyzer.generateDockerignore();
      const dockerignorePath = path.join(options.path, '.dockerignore');
      
      if (await fs.pathExists(dockerignorePath) && !options.force) {
        console.log(chalk.yellow('⚠️  .dockerignore already exists. Use --force to overwrite.'));
      } else {
        await fs.writeFile(dockerignorePath, dockerignore);
        console.log(chalk.green(`✅ Generated .dockerignore: ${dockerignorePath}`));
      }

      console.log(chalk.bold('\n📋 Optimization Summary:'));
      console.log('• Multi-stage build for reduced image size');
      console.log('• Non-root user for security');
      console.log('• Optimized layer caching');
      console.log('• Health check included');
      console.log('• Alpine-based for smaller size');

    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

dockerCommand
  .command('scan')
  .description('Scan Docker image for vulnerabilities and security issues')
  .option('-i, --image <image>', 'Docker image to scan (builds current project if not specified)')
  .option('--json', 'Output results as JSON', false)
  .action(async (options) => {
    try {
      const scanner = new DockerScanner();
      
      console.log(chalk.blue('🔍 Scanning Docker image...'));
      
      const scan = await scanner.scanImage(options.image);

      if (options.json) {
        console.log(JSON.stringify(scan, null, 2));
        return;
      }

      console.log(chalk.bold(`\n📋 Docker Image Scan Results: ${scan.image}`));
      
      // Vulnerabilities
      console.log(chalk.bold('\n🔒 Vulnerability Scan:'));
      const vulns = scan.vulnerabilities;
      console.log(`• Critical: ${chalk.red(vulns.critical.length)}`);
      console.log(`• High: ${chalk.red(vulns.high.length)}`);
      console.log(`• Medium: ${chalk.yellow(vulns.medium.length)}`);
      console.log(`• Low: ${chalk.blue(vulns.low.length)}`);
      console.log(`• Info: ${chalk.gray(vulns.info.length)}`);
      console.log(`• Total: ${vulns.total}`);

      if (vulns.total > 0) {
        const vulnTable = new Table({
          head: ['Package', 'Version', 'Severity', 'Description'],
          colWidths: [20, 15, 10, 50]
        });

        [...vulns.critical, ...vulns.high, ...vulns.medium].forEach(vuln => {
          const severityColor = vuln.severity === 'critical' ? chalk.red : 
                               vuln.severity === 'high' ? chalk.red : 
                               vuln.severity === 'medium' ? chalk.yellow : chalk.blue;
          
          vulnTable.push([
            vuln.package,
            vuln.version,
            severityColor(vuln.severity),
            vuln.description
          ]);
        });

        console.log(vulnTable.toString());
      }

      // Image size
      console.log(chalk.bold('\n📏 Image Size:'));
      console.log(`• Total Size: ${scan.size}`);

      // Layers
      console.log(chalk.bold('\n📦 Layer Analysis:'));
      const layers = scan.layers;
      console.log(`• Total Layers: ${layers.total}`);
      
      if (layers.largestLayers.length > 0) {
        console.log(chalk.bold('\n🔍 Largest Layers:'));
        layers.largestLayers.forEach((layer, index) => {
          console.log(`${index + 1}. ${layer.size} - ${layer.command.substring(0, 60)}...`);
        });
      }

      // Secrets
      console.log(chalk.bold('\n🔐 Secret Scan:'));
      if (scan.secrets.length > 0) {
        console.log(chalk.red(`⚠️  Found ${scan.secrets.length} potential secrets:`));
        scan.secrets.forEach(secret => {
          console.log(chalk.red(`• ${secret.type} in ${secret.file} (${secret.matches} matches)`));
        });
      } else {
        console.log(chalk.green('✅ No secrets detected'));
      }

      // Permissions
      console.log(chalk.bold('\n👤 Permission Analysis:'));
      const perms = scan.permissions;
      console.log(`• Running as Root: ${perms.runningAsRoot ? '❌' : '✅'}`);
      console.log(`• Writable Filesystem: ${perms.writableFileSystem ? '⚠️' : '✅'}`);
      console.log(`• Sudo Installed: ${perms.sudoInstalled ? '❌' : '✅'}`);

      if (perms.issues.length > 0) {
        console.log(chalk.bold.red('\n⚠️ Permission Issues:'));
        perms.issues.forEach(issue => {
          console.log(chalk.red(`• ${issue}`));
        });
      }

      if (perms.suggestions.length > 0) {
        console.log(chalk.bold.yellow('\n💡 Permission Suggestions:'));
        perms.suggestions.forEach(suggestion => {
          console.log(chalk.yellow(`• ${suggestion}`));
        });
      }

    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

dockerCommand
  .command('performance')
  .description('Test Docker image performance')
  .option('-i, --image <image>', 'Docker image to test (builds current project if not specified)')
  .option('--json', 'Output results as JSON', false)
  .action(async (options) => {
    try {
      const performance = new DockerPerformance();
      
      console.log(chalk.blue('⚡ Testing Docker image performance...'));
      
      const results = await performance.testPerformance(options.image);

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      console.log(chalk.bold(`\n📋 Performance Test Results: ${results.image}`));
      
      // Build time
      console.log(chalk.bold('\n🔨 Build Performance:'));
      const build = results.buildTime;
      console.log(`• Average: ${build.average}ms`);
      console.log(`• Min: ${build.min}ms`);
      console.log(`• Max: ${build.max}ms`);
      console.log(`• Samples: ${build.samples}`);

      // Startup time
      console.log(chalk.bold('\n🚀 Startup Performance:'));
      const startup = results.startupTime;
      console.log(`• Average: ${startup.average}ms`);
      console.log(`• Min: ${startup.min}ms`);
      console.log(`• Max: ${startup.max}ms`);
      console.log(`• Samples: ${startup.samples}`);

      // Memory usage
      console.log(chalk.bold('\n💾 Memory Usage:'));
      const memory = results.memoryUsage;
      console.log(`• Current: ${memory.current}`);
      console.log(`• Total: ${memory.total}`);
      console.log(`• Percentage: ${memory.percentage}%`);
      console.log(`• Efficiency: ${memory.efficiency}`);

      // CPU usage
      console.log(chalk.bold('\n🔥 CPU Usage:'));
      const cpu = results.cpuUsage;
      console.log(`• Average: ${cpu.average}%`);
      console.log(`• Max: ${cpu.max}%`);
      console.log(`• Samples: ${cpu.samples}`);
      console.log(`• Efficiency: ${cpu.efficiency}`);

      // Network latency
      console.log(chalk.bold('\n🌐 Network Latency:'));
      const network = results.networkLatency;
      console.log(`• Average: ${network.average}${network.unit}`);
      console.log(`• Status: ${network.status}`);
      if (network.targets.length > 0) {
        console.log(chalk.bold('\n🎯 Latency by Target:'));
        network.targets.forEach(target => {
          console.log(`• ${target.target}: ${target.avgTime}${network.unit}`);
        });
      }

      // Disk I/O
      console.log(chalk.bold('\n💿 Disk I/O:'));
      const disk = results.diskIO;
      console.log(`• Write Speed: ${disk.write.speed} ${disk.write.unit} (${disk.write.status})`);
      console.log(`• Read Speed: ${disk.read.speed} ${disk.read.unit} (${disk.read.status})`);
      console.log(`• Overall: ${disk.overall}`);

      // Recommendations
      if (results.recommendations.length > 0) {
        console.log(chalk.bold('\n💡 Performance Recommendations:'));
        results.recommendations.forEach(rec => {
          const priorityColor = rec.priority === 'High' ? chalk.red : 
                              rec.priority === 'Medium' ? chalk.yellow : chalk.blue;
          console.log(`${priorityColor(`[${rec.priority}]`)} ${rec.category}: ${rec.message}`);
        });
      }

    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

dockerCommand
  .command('size')
  .description('Analyze Docker image size and layer breakdown')
  .option('-i, --image <image>', 'Docker image to analyze (builds current project if not specified)')
  .option('--json', 'Output results as JSON', false)
  .action(async (options) => {
    try {
      const scanner = new DockerScanner();
      
      console.log(chalk.blue('📏 Analyzing Docker image size...'));
      
      const scan = await scanner.scanImage(options.image);

      if (options.json) {
        console.log(JSON.stringify({
          image: scan.image,
          size: scan.size,
          layers: scan.layers
        }, null, 2));
        return;
      }

      console.log(chalk.bold(`\n📋 Size Analysis: ${scan.image}`));
      
      console.log(chalk.bold('\n📏 Image Size:'));
      console.log(`• Total Size: ${scan.size}`);

      console.log(chalk.bold('\n📦 Layer Breakdown:'));
      const layers = scan.layers;
      console.log(`• Total Layers: ${layers.total}`);
      
      if (layers.largestLayers.length > 0) {
        const layerTable = new Table({
          head: ['Size', 'Command'],
          colWidths: [15, 80]
        });

        layers.largestLayers.forEach((layer, index) => {
          layerTable.push([
            layer.size,
            layer.command.length > 75 ? layer.command.substring(0, 75) + '...' : layer.command
          ]);
        });

        console.log(chalk.bold('\n🔍 Largest Layers:'));
        console.log(layerTable.toString());
      }

      // Size optimization suggestions
      console.log(chalk.bold('\n💡 Size Optimization Tips:'));
      console.log('• Use multi-stage builds to reduce final image size');
      console.log('• Combine RUN commands to reduce layers');
      console.log('• Use .dockerignore to exclude unnecessary files');
      console.log('• Choose smaller base images (Alpine, distroless)');
      console.log('• Remove package manager cache after installing dependencies');

    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

program.parse();
