const express = require('express');
const axios = require('axios');
const router = express.Router();

// GitHub API base URL
const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Analyze a GitHub repository (GET method)
 * GET /api/github/analyze
 */
router.get('/analyze', async (req, res) => {
    try {
        const { owner, repo, maxFileSize } = req.query;
        let excludePatterns = [];
        
        // Parse exclude patterns from query
        if (req.query.exclude) {
            excludePatterns = req.query.exclude.split(',').map(pattern => pattern.trim());
        }
        
        // Convert maxFileSize to number
        const maxFileSizeKB = maxFileSize ? parseInt(maxFileSize) : 50;
        
        // Process the repository analysis (same for both GET and POST)
        await processRepositoryAnalysis(owner, repo, excludePatterns, maxFileSizeKB, res);
    } catch (error) {
        console.error('Error analyzing repository (GET):', error);
        res.status(500).json({ 
            message: 'Failed to analyze repository', 
            error: error.message 
        });
    }
});

/**
 * Analyze a GitHub repository (POST method)
 * POST /api/github/analyze
 */
router.post('/analyze', async (req, res) => {
    try {
        const { owner, repo } = req.query;
        const { excludePatterns = [], maxFileSizeKB = 50 } = req.body;
        
        // Process the repository analysis (same for both GET and POST)
        await processRepositoryAnalysis(owner, repo, excludePatterns, maxFileSizeKB, res);
    } catch (error) {
        console.error('Error analyzing repository (POST):', error);
        res.status(500).json({ 
            message: 'Failed to analyze repository', 
            error: error.message 
        });
    }
});

/**
 * Process repository analysis (shared between GET and POST handlers)
 */
async function processRepositoryAnalysis(owner, repo, excludePatterns, maxFileSizeKB, res) {
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
    
    // Prioritize important files first (like README.md)
    const prioritizedFiles = prioritizeFiles(filteredFiles);
    const filesToShow = prioritizedFiles.slice(0, Math.min(MAX_FILES_TO_FETCH, prioritizedFiles.length));
    
    // Prepare file array for structured output
    const fileContents = [];
    
    for (let i = 0; i < filesToShow.length; i++) {
        const file = filesToShow[i];
        try {
            const content = await getFileContent(owner, repo, file.sha);
            // Add to text digest
            digest += `### ${file.path}\n`;
            digest += '```\n';
            digest += content + '\n';
            digest += '```\n\n';
            
            // Add to structured data
            fileContents.push({
                path: file.path,
                content: content,
                language: getLanguageFromFilename(file.path),
                size: formatFileSize(file.size)
            });
        } catch (error) {
            digest += `### ${file.path}\n`;
            digest += `Error fetching content: ${error.message}\n\n`;
            
            fileContents.push({
                path: file.path,
                error: error.message,
                size: formatFileSize(file.size)
            });
        }
    }
    
    // Build directory structure for the UI
    const directoryStructure = buildDirectoryStructure(filteredFiles);
    
    // Get rate limit information
    const rateLimit = await getRateLimit();
    
    // Return combined response with both plain text and structured data
    res.json({
        digest,
        structured: {
            repository: {
                name: repoInfo.name,
                fullName: `${owner}/${repo}`,
                description: repoInfo.description || 'No description provided',
                url: repoInfo.html_url,
                stars: repoInfo.stargazers_count,
                forks: repoInfo.forks_count,
                defaultBranch: repoInfo.default_branch,
                language: repoInfo.language
            },
            fileStats: {
                totalCount: filteredFiles.length,
                totalSize: formatFileSize(filteredFiles.reduce((sum, file) => sum + file.size, 0)),
                maxFileSize: `${maxFileSizeKB}KB`,
                excludePatterns: excludePatterns.length > 0 ? excludePatterns : ['none']
            },
            directoryStructure,
            files: fileContents
        },
        rateLimit: {
            limit: rateLimit.limit,
            remaining: rateLimit.remaining,
            reset: rateLimit.reset
        }
    });
}

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
 * Prioritize files for display, putting README and important files first
 */
function prioritizeFiles(files) {
    // Make a copy of the files array to avoid modifying the original
    const sortedFiles = [...files];
    
    // Define priority file patterns
    const highPriorityPatterns = [
        /readme\.md/i,
        /index\.(html|js|ts|jsx|tsx)$/i,
        /package\.json$/i,
        /main\.(js|ts|py|go|java)$/i,
        /app\.(js|ts|py|go|java|jsx|tsx)$/i
    ];
    
    // Sort function that puts high priority files first
    return sortedFiles.sort((a, b) => {
        const aPath = a.path.toLowerCase();
        const bPath = b.path.toLowerCase();
        
        // Check if either file matches high priority patterns
        const aIsHighPriority = highPriorityPatterns.some(pattern => pattern.test(aPath));
        const bIsHighPriority = highPriorityPatterns.some(pattern => pattern.test(bPath));
        
        if (aIsHighPriority && !bIsHighPriority) return -1;
        if (!aIsHighPriority && bIsHighPriority) return 1;
        
        // If both or neither are high priority, sort by path length (shorter paths first)
        return aPath.length - bPath.length;
    });
}

/**
 * Build a hierarchical directory structure from a list of files
 */
function buildDirectoryStructure(files) {
    const root = { name: '', children: {}, type: 'dir' };
    
    files.forEach(file => {
        const parts = file.path.split('/');
        let current = root;
        
        parts.forEach((part, i) => {
            const isFile = i === parts.length - 1;
            
            if (isFile) {
                current.children[part] = { 
                    name: part, 
                    type: 'file',
                    size: file.size,
                    path: file.path,
                    sha: file.sha
                };
            } else {
                if (!current.children[part]) {
                    current.children[part] = { name: part, children: {}, type: 'dir' };
                }
                current = current.children[part];
            }
        });
    });
    
    return root;
}

/**
 * Get the programming language based on file extension
 */
function getLanguageFromFilename(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    
    const languageMap = {
        'js': 'javascript',
        'ts': 'typescript',
        'jsx': 'javascript',
        'tsx': 'typescript',
        'py': 'python',
        'html': 'html',
        'css': 'css',
        'scss': 'scss',
        'json': 'json',
        'md': 'markdown',
        'java': 'java',
        'c': 'c',
        'cpp': 'cpp',
        'h': 'c',
        'cs': 'csharp',
        'go': 'go',
        'rb': 'ruby',
        'php': 'php',
        'sh': 'bash',
        'yaml': 'yaml',
        'yml': 'yaml',
        'xml': 'xml',
        'sql': 'sql',
        'swift': 'swift',
        'kt': 'kotlin'
    };
    
    return languageMap[extension] || 'plaintext';
}

/**
 * Format file size in a human-readable way
 */
function formatFileSize(bytes) {
    if (bytes < 1024) {
        return bytes + ' B';
    } else if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + ' KB';
    } else {
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
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