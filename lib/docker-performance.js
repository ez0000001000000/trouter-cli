const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

class DockerPerformance {
  constructor() {
    this.projectPath = process.cwd();
    this.imageName = 'trouter-perf-test';
  }

  async testPerformance(imageTag = null) {
    const imageToTest = imageTag || await this.buildTempImage();
    
    try {
      const performance = {
        image: imageToTest,
        buildTime: await this.measureBuildTime(),
        startupTime: await this.measureStartupTime(imageToTest),
        memoryUsage: await this.measureMemoryUsage(imageToTest),
        cpuUsage: await this.measureCPUUsage(imageToTest),
        networkLatency: await this.measureNetworkLatency(imageToTest),
        diskIO: await this.measureDiskIO(imageToTest),
        recommendations: []
      };

      performance.recommendations = this.generateRecommendations(performance);

      if (!imageTag) {
        await this.cleanupTempImage(imageToTest);
      }

      return performance;
    } catch (error) {
      if (!imageTag) {
        await this.cleanupTempImage(imageToTest);
      }
      throw error;
    }
  }

  async buildTempImage() {
    console.log(chalk.blue('🔨 Building temporary Docker image for performance testing...'));
    
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

  async measureBuildTime() {
    console.log(chalk.blue('⏱️  Measuring build time...'));
    
    const iterations = 3;
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      
      try {
        execSync(`docker build --no-cache -t ${this.imageName}-build-test .`, { 
          stdio: 'pipe',
          cwd: this.projectPath 
        });
        
        const buildTime = Date.now() - startTime;
        times.push(buildTime);
        
        // Cleanup
        execSync(`docker rmi -f ${this.imageName}-build-test`, { stdio: 'pipe' });
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Build test ${i + 1} failed`));
      }
    }

    if (times.length === 0) {
      return { average: 0, min: 0, max: 0, unit: 'ms' };
    }

    return {
      average: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      min: Math.min(...times),
      max: Math.max(...times),
      unit: 'ms',
      samples: times.length
    };
  }

  async measureStartupTime(imageTag) {
    console.log(chalk.blue('⏱️  Measuring container startup time...'));
    
    const iterations = 5;
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      
      try {
        // Start container in detached mode
        const containerId = execSync(`docker run -d --name ${this.imageName}-startup-test-${i} ${imageTag}`, { 
          encoding: 'utf8',
          stdio: 'pipe'
        }).trim();

        // Wait for container to be healthy or running
        await this.waitForContainer(containerId, 30000);
        
        const startupTime = Date.now() - startTime;
        times.push(startupTime);
        
        // Cleanup
        execSync(`docker stop ${containerId}`, { stdio: 'pipe' });
        execSync(`docker rm ${containerId}`, { stdio: 'pipe' });
        
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Startup test ${i + 1} failed`));
      }
    }

    if (times.length === 0) {
      return { average: 0, min: 0, max: 0, unit: 'ms' };
    }

    return {
      average: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      min: Math.min(...times),
      max: Math.max(...times),
      unit: 'ms',
      samples: times.length
    };
  }

  async waitForContainer(containerId, timeout = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const status = execSync(`docker inspect --format='{{.State.Status}}' ${containerId}`, { 
          encoding: 'utf8',
          stdio: 'pipe'
        }).trim();
        
        if (status === 'running') {
          // Check if there's a health check and wait for it to be healthy
          try {
            const health = execSync(`docker inspect --format='{{.State.Health.Status}}' ${containerId}`, { 
              encoding: 'utf8',
              stdio: 'pipe'
            }).trim();
            
            if (health === 'healthy' || health === 'none') {
              return true;
            }
          } catch (error) {
            // No health check, container is running
            return true;
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        // Container might not exist or failed to start
        throw new Error('Container failed to start');
      }
    }
    
    throw new Error('Container startup timeout');
  }

  async measureMemoryUsage(imageTag) {
    console.log(chalk.blue('💾 Measuring memory usage...'));
    
    try {
      const containerId = execSync(`docker run -d --name ${this.imageName}-memory-test ${imageTag}`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();

      // Wait for container to fully start
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Get memory usage
      const stats = execSync(`docker stats ${containerId} --no-stream --format "{{.MemUsage}}\\t{{.MemPerc}}"`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();

      const [memUsage, memPercent] = stats.split('\t');
      const [current, total] = memUsage.split('/').map(s => this.parseMemorySize(s));

      // Cleanup
      execSync(`docker stop ${containerId}`, { stdio: 'pipe' });
      execSync(`docker rm ${containerId}`, { stdio: 'pipe' });

      return {
        current: this.formatMemorySize(current),
        total: this.formatMemorySize(total),
        percentage: parseFloat(memPercent.replace('%', '')),
        efficiency: this.calculateMemoryEfficiency(current, total)
      };
    } catch (error) {
      console.log(chalk.yellow('⚠️  Memory usage measurement failed'));
      return {
        current: 'Unknown',
        total: 'Unknown',
        percentage: 0,
        efficiency: 'Unknown'
      };
    }
  }

  parseMemorySize(sizeStr) {
    const units = { B: 0, KiB: 1, MiB: 1, GiB: 2, TiB: 3 };
    const [size, unit] = sizeStr.match(/(\d+\.?\d*)(B|KiB|MiB|GiB|TiB)/) || [];
    return parseFloat(size) * Math.pow(1024, units[unit] || 0);
  }

  formatMemorySize(bytes) {
    const units = ['B', 'KiB', 'MiB', 'GiB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
  }

  calculateMemoryEfficiency(current, total) {
    if (total === 0) return 'Unknown';
    const efficiency = (current / total) * 100;
    
    if (efficiency < 10) return 'Excellent';
    if (efficiency < 25) return 'Good';
    if (efficiency < 50) return 'Fair';
    return 'Poor';
  }

  async measureCPUUsage(imageTag) {
    console.log(chalk.blue('🔥 Measuring CPU usage...'));
    
    try {
      const containerId = execSync(`docker run -d --name ${this.imageName}-cpu-test ${imageTag}`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();

      // Wait for container to fully start
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Measure CPU usage over time
      const measurements = [];
      for (let i = 0; i < 10; i++) {
        const stats = execSync(`docker stats ${containerId} --no-stream --format "{{.CPUPerc}}"`, { 
          encoding: 'utf8',
          stdio: 'pipe'
        }).trim();
        
        measurements.push(parseFloat(stats.replace('%', '')));
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Cleanup
      execSync(`docker stop ${containerId}`, { stdio: 'pipe' });
      execSync(`docker rm ${containerId}`, { stdio: 'pipe' });

      const avgCPU = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const maxCPU = Math.max(...measurements);

      return {
        average: Math.round(avgCPU * 100) / 100,
        max: Math.round(maxCPU * 100) / 100,
        samples: measurements.length,
        efficiency: this.calculateCPUEfficiency(avgCPU)
      };
    } catch (error) {
      console.log(chalk.yellow('⚠️  CPU usage measurement failed'));
      return {
        average: 0,
        max: 0,
        samples: 0,
        efficiency: 'Unknown'
      };
    }
  }

  calculateCPUEfficiency(avgCPU) {
    if (avgCPU < 5) return 'Excellent';
    if (avgCPU < 15) return 'Good';
    if (avgCPU < 30) return 'Fair';
    return 'Poor';
  }

  async measureNetworkLatency(imageTag) {
    console.log(chalk.blue('🌐 Measuring network latency...'));
    
    try {
      const containerId = execSync(`docker run -d --name ${this.imageName}-network-test ${imageTag}`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();

      // Wait for container to fully start
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Test network latency by pinging from container
      const pingResults = [];
      const targets = ['8.8.8.8', '1.1.1.1', 'google.com'];
      
      for (const target of targets) {
        try {
          const pingOutput = execSync(`docker exec ${containerId} ping -c 3 ${target}`, { 
            encoding: 'utf8',
            stdio: 'pipe'
          });
          
          const avgTime = this.extractPingAverage(pingOutput);
          if (avgTime) {
            pingResults.push({ target, avgTime });
          }
        } catch (error) {
          // Ping failed for this target
        }
      }

      // Cleanup
      execSync(`docker stop ${containerId}`, { stdio: 'pipe' });
      execSync(`docker rm ${containerId}`, { stdio: 'pipe' });

      if (pingResults.length === 0) {
        return {
          average: 0,
          targets: [],
          unit: 'ms',
          status: 'Failed'
        };
      }

      const avgLatency = pingResults.reduce((sum, r) => sum + r.avgTime, 0) / pingResults.length;

      return {
        average: Math.round(avgLatency * 100) / 100,
        targets: pingResults,
        unit: 'ms',
        status: 'Success'
      };
    } catch (error) {
      console.log(chalk.yellow('⚠️  Network latency measurement failed'));
      return {
        average: 0,
        targets: [],
        unit: 'ms',
        status: 'Failed'
      };
    }
  }

  extractPingAverage(pingOutput) {
    const match = pingOutput.match(/avg = (\d+\.?\d+)/);
    return match ? parseFloat(match[1]) : null;
  }

  async measureDiskIO(imageTag) {
    console.log(chalk.blue('💿 Measuring disk I/O...'));
    
    try {
      const containerId = execSync(`docker run -d --name ${this.imageName}-disk-test ${imageTag}`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();

      // Wait for container to fully start
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Test disk write speed
      const writeTest = await this.testDiskWrite(containerId);
      
      // Test disk read speed
      const readTest = await this.testDiskRead(containerId);

      // Cleanup
      execSync(`docker stop ${containerId}`, { stdio: 'pipe' });
      execSync(`docker rm ${containerId}`, { stdio: 'pipe' });

      return {
        write: writeTest,
        read: readTest,
        overall: this.calculateOverallDiskPerformance(writeTest, readTest)
      };
    } catch (error) {
      console.log(chalk.yellow('⚠️  Disk I/O measurement failed'));
      return {
        write: { speed: 0, unit: 'MB/s', status: 'Failed' },
        read: { speed: 0, unit: 'MB/s', status: 'Failed' },
        overall: 'Unknown'
      };
    }
  }

  async testDiskWrite(containerId) {
    try {
      const startTime = Date.now();
      
      // Write a 100MB file
      execSync(`docker exec ${containerId} dd if=/dev/zero of=/tmp/test_write bs=1M count=100`, { 
        stdio: 'pipe'
      });
      
      const writeTime = (Date.now() - startTime) / 1000; // Convert to seconds
      const writeSpeed = 100 / writeTime; // MB/s
      
      // Cleanup
      execSync(`docker exec ${containerId} rm -f /tmp/test_write`, { stdio: 'pipe' });
      
      return {
        speed: Math.round(writeSpeed * 100) / 100,
        unit: 'MB/s',
        status: 'Success'
      };
    } catch (error) {
      return { speed: 0, unit: 'MB/s', status: 'Failed' };
    }
  }

  async testDiskRead(containerId) {
    try {
      // Create a test file first
      execSync(`docker exec ${containerId} dd if=/dev/zero of=/tmp/test_read bs=1M count=50`, { 
        stdio: 'pipe'
      });
      
      const startTime = Date.now();
      
      // Read the file
      execSync(`docker exec ${containerId} dd if=/tmp/test_read of=/dev/null bs=1M`, { 
        stdio: 'pipe'
      });
      
      const readTime = (Date.now() - startTime) / 1000; // Convert to seconds
      const readSpeed = 50 / readTime; // MB/s
      
      // Cleanup
      execSync(`docker exec ${containerId} rm -f /tmp/test_read`, { stdio: 'pipe' });
      
      return {
        speed: Math.round(readSpeed * 100) / 100,
        unit: 'MB/s',
        status: 'Success'
      };
    } catch (error) {
      return { speed: 0, unit: 'MB/s', status: 'Failed' };
    }
  }

  calculateOverallDiskPerformance(writeTest, readTest) {
    if (writeTest.status === 'Failed' || readTest.status === 'Failed') {
      return 'Unknown';
    }
    
    const avgSpeed = (writeTest.speed + readTest.speed) / 2;
    
    if (avgSpeed > 100) return 'Excellent';
    if (avgSpeed > 50) return 'Good';
    if (avgSpeed > 20) return 'Fair';
    return 'Poor';
  }

  generateRecommendations(performance) {
    const recommendations = [];

    // Build time recommendations
    if (performance.buildTime.average > 60000) { // > 1 minute
      recommendations.push({
        category: 'Build',
        priority: 'High',
        message: 'Build time is slow. Consider using Docker layer caching and multi-stage builds.'
      });
    }

    // Startup time recommendations
    if (performance.startupTime.average > 10000) { // > 10 seconds
      recommendations.push({
        category: 'Startup',
        priority: 'High',
        message: 'Startup time is slow. Optimize application initialization and consider health checks.'
      });
    }

    // Memory usage recommendations
    if (performance.memoryUsage.percentage > 80) {
      recommendations.push({
        category: 'Memory',
        priority: 'High',
        message: 'Memory usage is high. Profile memory leaks and optimize memory usage.'
      });
    }

    // CPU usage recommendations
    if (performance.cpuUsage.average > 50) {
      recommendations.push({
        category: 'CPU',
        priority: 'Medium',
        message: 'CPU usage is high. Consider optimizing algorithms and reducing computational overhead.'
      });
    }

    // Network latency recommendations
    if (performance.networkLatency.status === 'Success' && performance.networkLatency.average > 100) {
      recommendations.push({
        category: 'Network',
        priority: 'Low',
        message: 'Network latency is higher than expected. Check network configuration.'
      });
    }

    // Disk I/O recommendations
    if (performance.diskIO.overall === 'Poor') {
      recommendations.push({
        category: 'Disk',
        priority: 'Medium',
        message: 'Disk I/O performance is poor. Consider optimizing file operations and using faster storage.'
      });
    }

    return recommendations;
  }
}

module.exports = DockerPerformance;
