/**
 * Analyzes a GitHub repository and generates a digest
 * @param {string} owner - Repository owner username
 * @param {string} repo - Repository name
 * @param {string[]} excludePatterns - Patterns to exclude from analysis
 * @param {number} maxFileSizeKB - Maximum file size to include in analysis (KB)
 * @returns {Promise<Object>} Repository digest and rate limit info
 */
async function analyzeRepository(owner, repo, excludePatterns = [], maxFileSizeKB = 50) {
    try {
        // Check if we're running from file:// protocol
        const isFileProtocol = window.location.protocol === 'file:';
        
        // If we're running from file://, call GitHub API directly
        // Otherwise use our backend API
        if (isFileProtocol) {
            // Direct call to GitHub API when running from filesystem
            return await directGitHubApiCall(owner, repo, excludePatterns, maxFileSizeKB);
        } else {
            // Call our backend API when running from a server
            const response = await fetch(`/api/github/analyze?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    excludePatterns,
                    maxFileSizeKB
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to analyze repository');
            }
            
            return await response.json();
        }
    } catch (error) {
        console.error('Error analyzing repository:', error);
        throw error;
    }
}

/**
 * Direct call to GitHub API when running from filesystem
 * Note: This has rate limits and won't handle file filtering server-side
 */
async function directGitHubApiCall(owner, repo, excludePatterns, maxFileSizeKB) {
    try {
        // GitHub API base URL
        const GITHUB_API_BASE = 'https://api.github.com';
        
        // Get repository information
        const repoResponse = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`);
        if (!repoResponse.ok) {
            throw new Error(repoResponse.status === 404 ? 'Repository not found' : 'Failed to fetch repository data');
        }
        const repoInfo = await repoResponse.json();
        
        // Get file structure (tree)
        const treeResponse = await fetch(
            `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${repoInfo.default_branch}?recursive=1`
        );
        if (!treeResponse.ok) {
            throw new Error('Failed to fetch repository files');
        }
        const treeData = await treeResponse.json();
        
        // Filter files (only blobs, not trees)
        let files = treeData.tree.filter(item => item.type === 'blob');
        
        // Apply size filtering
        files = files.filter(file => {
            const fileSizeKB = file.size / 1024;
            return fileSizeKB <= maxFileSizeKB;
        });
        
        // Apply pattern filtering
        if (excludePatterns.length > 0) {
            files = files.filter(file => {
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
        
        // Build directory structure
        const directoryStructure = buildDirectoryStructure(files);
        
        // Get content of some files (limited to avoid rate limits)
        const MAX_FILES_TO_FETCH = 3; // Lower limit for direct API access
        const filesToShow = [];
        
        if (files.length > 0) {
            // Prioritize README and important files first
            const prioritizedFiles = prioritizeFiles(files);
            
            for (let i = 0; i < Math.min(MAX_FILES_TO_FETCH, prioritizedFiles.length); i++) {
                const file = prioritizedFiles[i];
                try {
                    // Get file content
                    const contentResponse = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${file.path}`);
                    if (!contentResponse.ok) {
                        throw new Error('Failed to fetch file content');
                    }
                    
                    const contentData = await contentResponse.json();
                    // GitHub returns base64 encoded content
                    const content = atob(contentData.content.replace(/\n/g, ''));
                    
                    // Determine language for syntax highlighting
                    const language = getLanguageFromFilename(file.path);
                    
                    filesToShow.push({
                        path: file.path,
                        content: content,
                        language: language,
                        size: formatFileSize(file.size)
                    });
                } catch (error) {
                    filesToShow.push({
                        path: file.path,
                        error: error.message,
                        size: formatFileSize(file.size)
                    });
                }
            }
        }
        
        // Get rate limit information
        const rateResponse = await fetch(`${GITHUB_API_BASE}/rate_limit`);
        const rateData = await rateResponse.json();
        
        // Build the plain text digest for compatibility
        let digest = `# Repository Analysis for ${owner}/${repo}\n\n`;
        digest += `## Repository Overview\n`;
        digest += `- Name: ${repoInfo.name}\n`;
        digest += `- Description: ${repoInfo.description || 'No description'}\n`;
        digest += `- Stars: ${repoInfo.stargazers_count}\n`;
        digest += `- Forks: ${repoInfo.forks_count}\n`;
        digest += `- Default Branch: ${repoInfo.default_branch}\n\n`;
        
        digest += `## File Structure\n`;
        digest += `Total files: ${files.length} (after filtering)\n\n`;
        
        digest += `## Files (Max ${maxFileSizeKB}KB, excluding: ${excludePatterns.join(', ') || 'none'})\n\n`;
        
        if (filesToShow.length > 0) {
            digest += `Showing content for first ${filesToShow.length} files:\n\n`;
            
            for (const file of filesToShow) {
                digest += `### ${file.path}\n`;
                if (file.error) {
                    digest += `Error fetching content: ${file.error}\n\n`;
                } else {
                    digest += '```\n';
                    digest += file.content + '\n';
                    digest += '```\n\n';
                }
            }
        } else {
            digest += 'No files match the current filters.\n\n';
        }
        
        // Return structured data
        return {
            // Plain text digest for compatibility
            digest,
            
            // Structured data for enhanced UI
            structured: {
                repository: {
                    name: repoInfo.name,
                    fullName: `${owner}/${repo}`,
                    description: repoInfo.description || 'No description provided',
                    url: repoInfo.html_url,
                    stars: repoInfo.stargazers_count,
                    forks: repoInfo.forks_count,
                    defaultBranch: repoInfo.default_branch,
                    language: repoInfo.language,
                    avatar: repoInfo.owner?.avatar_url
                },
                fileStats: {
                    totalCount: files.length,
                    totalSize: formatFileSize(files.reduce((sum, file) => sum + file.size, 0)),
                    maxFileSize: `${maxFileSizeKB}KB`,
                    excludePatterns: excludePatterns.length > 0 ? excludePatterns : ['none']
                },
                directoryStructure,
                files: filesToShow
            },
            
            // Rate limit info
            rateLimit: {
                limit: rateData.rate.limit,
                remaining: rateData.rate.remaining,
                reset: rateData.rate.reset
            }
        };
    } catch (error) {
        console.error('Error with direct GitHub API call:', error);
        throw error;
    }
}

/**
 * Builds a hierarchical directory structure from a list of files
 * @param {Array} files - List of file objects with path properties
 * @returns {Object} - Hierarchical directory structure
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
 * Prioritizes files for display, putting README and important files first
 * @param {Array} files - List of file objects
 * @returns {Array} - Prioritized file list
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
 * Get the programming language based on file extension
 * @param {string} filename - The filename to analyze
 * @returns {string} - Language identifier for syntax highlighting
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
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size
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