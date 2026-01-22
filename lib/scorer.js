const axios = require('axios');
const semver = require('semver');
const chalk = require('chalk');

class DependencyScorer {
  constructor() {
    this.npmRegistry = 'https://registry.npmjs.org';
    this.githubApi = 'https://api.github.com';
  }

  async scorePackage(packageName, version = 'latest') {
    try {
      const npmData = await this.getNpmData(packageName, version);
      const githubData = await this.getGithubData(npmData);
      
      const score = this.calculateScore(npmData, githubData);
      const reasons = this.getScoreReasons(npmData, githubData, score);

      return {
        name: packageName,
        version: npmData.version,
        score,
        reasons,
        details: {
          npm: npmData,
          github: githubData
        }
      };
    } catch (error) {
      return {
        name: packageName,
        version: version,
        score: 0,
        reasons: [`Error fetching data: ${error.message}`],
        error: true
      };
    }
  }

  async getNpmData(packageName, version) {
    const response = await axios.get(`${this.npmRegistry}/${packageName}`);
    const packageData = response.data;
    
    const versionData = version === 'latest' 
      ? packageData['dist-tags']?.latest 
        ? packageData.versions[packageData['dist-tags'].latest]
        : Object.values(packageData.versions)[0]
      : packageData.versions[version];

    if (!versionData) {
      throw new Error(`Version ${version} not found for ${packageName}`);
    }

    return {
      name: packageData.name,
      version: versionData.version,
      description: versionData.description,
      maintainers: packageData.maintainers || [],
      homepage: versionData.homepage,
      repository: versionData.repository,
      publishedAt: versionData.publish_time ? new Date(versionData.publish_time) : null,
      dependencies: Object.keys(versionData.dependencies || {}),
      devDependencies: Object.keys(versionData.devDependencies || {}),
      downloads: await this.getDownloadStats(packageName),
      lastUpdate: versionData.publish_time ? new Date(versionData.publish_time) : null
    };
  }

  async getDownloadStats(packageName) {
    try {
      const response = await axios.get(`${this.npmRegistry}/downloads/point/last-month/${packageName}`);
      return response.data.downloads || 0;
    } catch (error) {
      return 0;
    }
  }

  async getGithubData(npmData) {
    if (!npmData.repository?.url) {
      return null;
    }

    const githubUrl = this.extractGithubUrl(npmData.repository.url);
    if (!githubUrl) {
      return null;
    }

    try {
      const [owner, repo] = githubUrl.split('/').slice(-2);
      const response = await axios.get(`${this.githubApi}/repos/${owner}/${repo}`);
      
      const repoData = response.data;
      return {
        stars: repoData.stargazers_count || 0,
        forks: repoData.forks_count || 0,
        openIssues: repoData.open_issues_count || 0,
        lastCommit: await this.getLastCommitDate(owner, repo),
        createdAt: new Date(repoData.created_at),
        updatedAt: new Date(repoData.updated_at),
        archived: repoData.archived || false,
        defaultBranch: repoData.default_branch
      };
    } catch (error) {
      return null;
    }
  }

  async getLastCommitDate(owner, repo) {
    try {
      const response = await axios.get(`${this.githubApi}/repos/${owner}/${repo}/commits`, {
        params: { per_page: 1 }
      });
      return new Date(response.data[0]?.commit?.committer?.date);
    } catch (error) {
      return null;
    }
  }

  extractGithubUrl(repoUrl) {
    const githubPatterns = [
      /github\.com\/([^\/]+)\/([^\/\?#]+)/,
      /git@github\.com:([^\/]+)\/([^\/\?#]+)/
    ];

    for (const pattern of githubPatterns) {
      const match = repoUrl.match(pattern);
      if (match) {
        return `${match[1]}/${match[2]}`;
      }
    }
    return null;
  }

  calculateScore(npmData, githubData) {
    let score = 0;

    // Recent activity (30 points)
    if (npmData.lastUpdate) {
      const daysSinceUpdate = (Date.now() - npmData.lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate <= 30) score += 30;
      else if (daysSinceUpdate <= 90) score += 25;
      else if (daysSinceUpdate <= 180) score += 20;
      else if (daysSinceUpdate <= 365) score += 15;
      else if (daysSinceUpdate <= 730) score += 10;
      else if (daysSinceUpdate <= 1095) score += 5;
    }

    // GitHub activity (25 points)
    if (githubData && !githubData.archived) {
      if (githubData.lastCommit) {
        const daysSinceCommit = (Date.now() - githubData.lastCommit.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceCommit <= 30) score += 15;
        else if (daysSinceCommit <= 90) score += 12;
        else if (daysSinceCommit <= 180) score += 10;
        else if (daysSinceCommit <= 365) score += 8;
        else if (daysSinceCommit <= 730) score += 5;
        else if (daysSinceCommit <= 1095) score += 3;
      }

      // Stars and community (10 points)
      if (githubData.stars >= 1000) score += 10;
      else if (githubData.stars >= 500) score += 8;
      else if (githubData.stars >= 100) score += 6;
      else if (githubData.stars >= 50) score += 4;
      else if (githubData.stars >= 10) score += 2;
    }

    // Downloads/popularity (20 points)
    if (npmData.downloads >= 1000000) score += 20;
    else if (npmData.downloads >= 100000) score += 15;
    else if (npmData.downloads >= 10000) score += 10;
    else if (npmData.downloads >= 1000) score += 5;
    else if (npmData.downloads >= 100) score += 2;

    // Maintainers (15 points)
    if (npmData.maintainers.length >= 3) score += 15;
    else if (npmData.maintainers.length >= 2) score += 10;
    else if (npmData.maintainers.length >= 1) score += 5;

    // Issues penalty (deductions)
    if (githubData) {
      if (githubData.openIssues > 100) score -= 10;
      else if (githubData.openIssues > 50) score -= 5;
      else if (githubData.openIssues > 20) score -= 2;

      if (githubData.archived) score -= 20;
    }

    return Math.max(0, Math.min(10, score));
  }

  getScoreReasons(npmData, githubData, score) {
    const reasons = [];

    if (score >= 8) {
      reasons.push('Excellent package health and maintenance');
    } else if (score >= 6) {
      reasons.push('Good package with active maintenance');
    } else if (score >= 4) {
      reasons.push('Moderate package health - some concerns');
    } else if (score >= 2) {
      reasons.push('Low package health - significant concerns');
    } else {
      reasons.push('Very poor package health - high risk');
    }

    // Specific reasons
    if (npmData.lastUpdate) {
      const daysSinceUpdate = (Date.now() - npmData.lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate > 365) {
        reasons.push(`No updates for ${Math.floor(daysSinceUpdate / 365)} year(s)`);
      }
    }

    if (githubData) {
      if (githubData.archived) {
        reasons.push('Repository is archived - no longer maintained');
      }

      if (githubData.lastCommit) {
        const daysSinceCommit = (Date.now() - githubData.lastCommit.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceCommit > 365) {
          reasons.push(`No commits for ${Math.floor(daysSinceCommit / 365)} year(s)`);
        }
      }

      if (githubData.openIssues > 50) {
        reasons.push(`${githubData.openIssues} open issues - may indicate maintenance problems`);
      }
    }

    if (npmData.maintainers.length === 0) {
      reasons.push('No maintainers listed');
    }

    return reasons;
  }

  getScoreColor(score) {
    if (score >= 8) return chalk.green;
    if (score >= 6) return chalk.yellow;
    if (score >= 4) return chalk.orange;
    return chalk.red;
  }
}

module.exports = DependencyScorer;
