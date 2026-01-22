# Trouter CLI

A comprehensive CLI tool for Docker optimization and analysis. Trouter CLI helps you build better, more secure, and faster Docker containers.

## Features

### 🐳 Docker Optimization & Analysis
- **Dockerfile Analysis**: Multi-stage builds, security, size, and performance analysis
- **Optimization Generator**: Creates optimized Dockerfile and .dockerignore
- **Security Scanning**: Vulnerability detection, secret scanning, permission analysis
- **Performance Testing**: Build time, startup time, memory, CPU, network, and disk I/O testing
- **Size Analysis**: Layer breakdown and optimization recommendations

## Installation

```bash
npm install -g trouter-cli
```

## Usage

### Docker Commands

#### Analyze Dockerfile
```bash
trouter-cli docker analyze
trouter-cli docker analyze --json
```

#### Generate optimized Docker configuration
```bash
trouter-cli docker optimize
trouter-cli docker optimize --force  # Overwrite existing files
```

#### Scan Docker image for security issues
```bash
trouter-cli docker scan
trouter-cli docker scan --image my-app:latest
trouter-cli docker scan --json
```

#### Test Docker image performance
```bash
trouter-cli docker performance
trouter-cli docker performance --image my-app:latest
trouter-cli docker performance --json
```

#### Analyze Docker image size
```bash
trouter-cli docker size
trouter-cli docker size --image my-app:latest
trouter-cli docker size --json
```

## Docker Features

### 🔍 Docker Analysis
- Multi-stage build detection
- Package manager detection (npm/yarn/pnpm)
- Security analysis (root user, HTTPS, sensitive data)
- Size estimation and optimization suggestions
- Performance analysis (health checks, resource limits)

### 🔧 Optimization Generator
- Multi-stage builds for reduced image size
- Non-root user configuration
- Optimized layer caching
- Health check inclusion
- Alpine-based images for smaller size

### 🔒 Security Scanning
- Vulnerability detection (Docker Scout/Trivy integration)
- Secret scanning (passwords, tokens, API keys)
- Permission analysis (root user, filesystem, sudo)
- Layer analysis for security issues

### ⚡ Performance Testing
- Build time measurement
- Startup time analysis
- Memory usage profiling
- CPU usage monitoring
- Network latency testing
- Disk I/O benchmarking

### 📏 Size Analysis
- Total image size reporting
- Layer breakdown and analysis
- Largest layers identification
- Size optimization tips

## Examples

### Docker Analysis
```bash
$ trouter-cli docker analyze

📋 Dockerfile Analysis

📊 Basic Information:
• Lines: 30
• Base Image: node:18-alpine
• Node Version: 18
• Package Manager: npm
• Stages: 2

⚡ Optimization Analysis:
• Multi-stage Build: ✅
• Package Cache: ✅
• .dockerignore: ✅
• Alpine Base: ✅
• Production Flag: ✅
```

### Docker Security Scan
```bash
$ trouter-cli docker scan

📋 Docker Image Scan Results: my-app:latest

🔒 Vulnerability Scan:
• Critical: 0
• High: 2
• Medium: 5
• Low: 12
• Info: 8
• Total: 27

🔐 Secret Scan:
✅ No secrets detected

👤 Permission Analysis:
• Running as Root: ✅
• Writable Filesystem: ✅
• Sudo Installed: ✅
```

### Docker Performance Testing
```bash
$ trouter-cli docker performance

📋 Performance Test Results: my-app:latest

🔨 Build Performance:
• Average: 15.2s
• Min: 12.1s
• Max: 18.9s

🚀 Startup Performance:
• Average: 2.3s
• Min: 1.8s
• Max: 3.1s

💾 Memory Usage:
• Current: 128MiB
• Total: 2GiB
• Percentage: 6%
• Efficiency: Excellent
```

## Options

### `trouter-cli docker analyze`
- `-p, --path <path>`: Path to project directory (default: current directory)
- `--json`: Output results as JSON

### `trouter-cli docker optimize`
- `-p, --path <path>`: Path to project directory (default: current directory)
- `--force`: Overwrite existing files

### `trouter-cli docker scan`
- `-i, --image <image>`: Docker image to scan (builds current project if not specified)
- `--json`: Output results as JSON

### `trouter-cli docker performance`
- `-i, --image <image>`: Docker image to test (builds current project if not specified)
- `--json`: Output results as JSON

### `trouter-cli docker size`
- `-i, --image <image>`: Docker image to analyze (builds current project if not specified)
- `--json`: Output results as JSON

## How it Works

### Docker Analysis
Trouter CLI analyzes your Dockerfile and provides recommendations for:
- **Multi-stage builds** to reduce final image size
- **Layer caching optimization** for faster builds
- **Security best practices** (non-root users, HTTPS base images)
- **Size optimization** (Alpine images, .dockerignore usage)
- **Performance improvements** (health checks, resource limits)

### Security Scanning
The tool scans Docker images for:
- **Known vulnerabilities** using npm audit and security databases
- **Secrets and credentials** using pattern matching
- **Permission issues** (root user, writable filesystems)
- **Docker best practices** violations

### Performance Testing
Trouter CLI measures real-world performance metrics:
- **Build time** across multiple iterations
- **Container startup time** with health check validation
- **Memory and CPU usage** under typical load
- **Network latency** to external services
- **Disk I/O performance** for read/write operations

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT
