const express = require('express');
const axios = require('axios');
const router = express.Router();

// GitHub API base URL
const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Analyze a GitHub repository
 * POST /api/github/analyze
 */
router.post('/analyze', async (req, res) => {
    try {
        const { owner, repo } = req.query;
        const { excludePatterns = [], maxFileSizeKB = 50 } = req.body;
        
        if (!owner || !repo) {
            return res.status(400).json({ message: 'Owner and repo are required' });
        }
        
        // Start building the repository digest
        let digest = `# Repository Analysis for ${owner}/${repo}\n\n`;
        
        // Get repository information
        const repoInfo = await getRepositoryInfo(owner, repo);
        digest += `## Repository Overview\n`;
        digest += `- Name: ${repoInfo.name}\n`;
        digest += `- Description: ${repoInfo.description || 'No description'}\n`;
        digest += `- Stars: ${repoInfo.stargazers_count}\n`;
        digest += `- Forks: ${repoInfo.forks_count}\n`;
        digest += `- Default Branch: ${repoInfo.default_branch}\n\n`;
        
        // Get file structure
        const files = await getRepositoryFiles(owner, repo, repoInfo.default_branch);
        
        // Filter out files based on exclude patterns and max file size
        const filteredFiles = filterFiles(files, excludePatterns, maxFileSizeKB);
        
        // Add file structure to digest
        digest += `## File Structure\n`;
        digest += `Total files: ${filteredFiles.length} (after filtering)\n\n`;
        
        // Add filtered files
        digest += `## Files (Max ${maxFileSizeKB}KB, excluding: ${excludePatterns.join(', ') || 'none'})\n`;
        
        // Get content of each file (limited to avoid rate limits)
        const MAX_FILES_TO_FETCH = 5; // Limit to avoid rate limits
        digest += `\nShowing content for first ${Math.min(MAX_FILES_TO_FETCH, filteredFiles.length)} files:\n\n`;
        
        for (let i = 0; i < Math.min(MAX_FILES_TO_FETCH, filteredFiles.length); i++) {
            const file = filteredFiles[i];
            try {
                const content = await getFileContent(owner, repo, file.sha);
                digest += `### ${file.path}\n`;
                digest += '```\n';
                digest += content + '\n';
                digest += '```\n\n';
            } catch (error) {
                digest += `### ${file.path}\n`;
                digest += `Error fetching content: ${error.message}\n\n`;
            }
        }
        
        // Get rate limit information
        const rateLimit = await getRateLimit();
        
        res.json({
            digest,
            rateLimit: {
                limit: rateLimit.limit,
                remaining: rateLimit.remaining,
                reset: rateLimit.reset
            }
        });
    } catch (error) {
        console.error('Error analyzing repository:', error);
        res.status(500).json({ 
            message: 'Failed to analyze repository', 
            error: error.message 
        });
    }
});

/**
 * Get basic information about a repository
 */
async function getRepositoryInfo(owner, repo) {
    try {
        const response = await axios.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}`);
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            throw new Error('Repository not found');
        }
        throw error;
    }
}

/**
 * Get file structure of a repository
 */
async function getRepositoryFiles(owner, repo, branch = 'main') {
    try {
        // Get the tree recursively
        const response = await axios.get(
            `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
        );
        
        if (response.data.truncated) {
            console.warn('Repository tree is truncated due to size limits');
        }
        
        return response.data.tree.filter(item => item.type === 'blob');
    } catch (error) {
        throw new Error(`Failed to get repository files: ${error.message}`);
    }
}

/**
 * Get content of a file by its SHA
 */
async function getFileContent(owner, repo, sha) {
    try {
        const response = await axios.get(
            `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/blobs/${sha}`
        );
        
        // GitHub returns base64 encoded content
        const content = Buffer.from(response.data.content, 'base64').toString();
        return content;
    } catch (error) {
        throw new Error(`Failed to get file content: ${error.message}`);
    }
}

/**
 * Filter files based on exclude patterns and maximum file size
 */
function filterFiles(files, excludePatterns, maxFileSizeKB) {
    return files.filter(file => {
        // Check file size (GitHub API returns size in bytes)
        const fileSizeKB = file.size / 1024;
        if (fileSizeKB > maxFileSizeKB) {
            return false;
        }
        
        // Check exclude patterns
        for (const pattern of excludePatterns) {
            if (pattern.startsWith('*.')) {
                // Handle file extension pattern (e.g., *.md)
                const extension = pattern.substring(2);
                if (file.path.endsWith(`.${extension}`)) {
                    return false;
                }
            } else if (pattern.endsWith('/')) {
                // Handle directory pattern (e.g., src/)
                if (file.path.startsWith(pattern) || file.path.includes(`/${pattern}`)) {
                    return false;
                }
            } else {
                // Handle exact match
                if (file.path === pattern || file.path.includes(`/${pattern}`)) {
                    return false;
                }
            }
        }
        
        return true;
    });
}

/**
 * Get current rate limit status
 */
async function getRateLimit() {
    try {
        const response = await axios.get(`${GITHUB_API_BASE}/rate_limit`);
        return response.data.rate;
    } catch (error) {
        console.error('Error getting rate limit:', error);
        return { limit: 60, remaining: 0, reset: 0 };
    }
}

module.exports = router; 