document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const repoUrlInput = document.getElementById('repoUrl');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const exampleRepoButtons = document.querySelectorAll('.example-repo');
    const excludePatternsInput = document.getElementById('excludePatterns');
    const maxFileSizeSlider = document.getElementById('maxFileSize');
    const fileSizeValueSpan = document.getElementById('fileSizeValue');
    const rateLimitAlert = document.getElementById('rateLimitAlert');
    const requestsRemainingSpan = document.getElementById('requestsRemaining');
    const resultsSection = document.getElementById('resultsSection');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const repoDigest = document.getElementById('repoDigest');
    const structuredDigest = document.getElementById('structuredDigest');
    const copyBtn = document.getElementById('copyBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const modeAlert = document.getElementById('modeAlert');
    const modeMessage = document.getElementById('modeMessage');
    
    // Repository info elements
    const repoNameElement = document.getElementById('repoName');
    const repoDescriptionElement = document.getElementById('repoDescription');
    const repoStarsElement = document.getElementById('repoStars');
    const repoForksElement = document.getElementById('repoForks');
    const repoFilesElement = document.getElementById('repoFiles');
    const directoryStructureElement = document.getElementById('directoryStructure');
    const filesContentElement = document.getElementById('filesContent');
    
    // Display app mode (direct API or server-based)
    const isFileProtocol = window.location.protocol === 'file:';
    if (isFileProtocol) {
        console.log('Running in direct GitHub API mode');
        modeMessage.textContent = 'You are running in direct GitHub API mode. API rate limits apply (60 requests/hour). For higher limits, run the application via the Node.js server.';
        modeAlert.classList.remove('d-none');
    } else {
        console.log('Running in server-based mode');
        modeMessage.textContent = 'You are running in server mode, which handles API calls through the backend.';
        modeAlert.classList.remove('d-none');
    }
    
    // Close button for the alert
    const closeBtn = modeAlert.querySelector('.btn-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modeAlert.classList.add('d-none');
        });
    }
    
    // Update file size value display when slider changes
    maxFileSizeSlider.addEventListener('input', () => {
        fileSizeValueSpan.textContent = maxFileSizeSlider.value;
    });
    
    // Set example repository URLs when buttons are clicked
    exampleRepoButtons.forEach(button => {
        button.addEventListener('click', () => {
            repoUrlInput.value = button.dataset.repo;
            // Auto-trigger analysis for better UX
            analyzeBtn.click();
        });
    });
    
    // Enable GitHub URL ingest replacement
    repoUrlInput.addEventListener('input', function() {
        let val = this.value;
        if (val.includes('github.com')) {
            // Show a tooltip or hint about the "ingest" option
            const urlWithoutProtocol = val.replace(/^https?:\/\//, '');
            if (urlWithoutProtocol.startsWith('github.com')) {
                const ingestUrl = val.replace('github.com', 'gitingest.com');
                console.log(`You can also try: ${ingestUrl}`);
            }
        }
    });
    
    // Analyze repository when button is clicked
    analyzeBtn.addEventListener('click', async () => {
        const repoUrl = repoUrlInput.value.trim();
        if (!repoUrl) {
            alert('Please enter a GitHub repository URL');
            return;
        }
        
        // Handle gitingest.com URLs
        let processedUrl = repoUrl;
        if (repoUrl.includes('gitingest.com')) {
            processedUrl = repoUrl.replace('gitingest.com', 'github.com');
        }
        
        const excludePatterns = excludePatternsInput.value
            .split(',')
            .map(pattern => pattern.trim())
            .filter(pattern => pattern.length > 0);
            
        const maxFileSize = parseInt(maxFileSizeSlider.value);
        
        // Show results section and loading indicator
        resultsSection.classList.remove('d-none');
        loadingIndicator.classList.remove('d-none');
        structuredDigest.classList.add('d-none');
        repoDigest.classList.add('d-none');
        
        // Scroll to results
        resultsSection.scrollIntoView({ behavior: 'smooth' });
        
        try {
            // Extract owner and repo from URL
            const match = processedUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
            if (!match) {
                throw new Error('Invalid GitHub repository URL. Format should be: https://github.com/username/repository');
            }
            
            const owner = match[1];
            const repo = match[2].replace(/\/$/, ''); // Remove trailing slash if present
            
            // Fetch repository data using our API client
            const repoData = await analyzeRepository(owner, repo, excludePatterns, maxFileSize);
            
            // Display results in both formats
            if (repoData.structured) {
                displayStructuredData(repoData.structured);
                structuredDigest.classList.remove('d-none');
            } else {
                // Fallback to plain text if structured data is not available
                repoDigest.textContent = repoData.digest;
                repoDigest.classList.remove('d-none');
            }
            
            // Update rate limit information
            checkRateLimit(repoData.rateLimit);
            
            // Hide loading indicator
            loadingIndicator.classList.add('d-none');
        } catch (error) {
            // Handle errors with more detailed information
            loadingIndicator.classList.add('d-none');
            
            // Provide a more user-friendly error message
            let errorMessage = error.message;
            
            // Add additional context based on error type
            if (error.message.includes('Failed to fetch')) {
                if (isFileProtocol) {
                    errorMessage = 'Failed to connect to GitHub API. Make sure you have internet access and the repository exists.';
                } else {
                    errorMessage = 'Failed to connect to server. Make sure the server is running and accessible.';
                }
            } else if (error.message.includes('rate limit')) {
                errorMessage = 'GitHub API rate limit exceeded. Please wait an hour before trying again or use the server version.';
            } else if (error.message.includes('Repository not found')) {
                errorMessage = 'Repository not found. Check that the URL is correct and the repository is public.';
            }
            
            // Show error in both display modes
            filesContentElement.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-circle me-2"></i>
                    <strong>Error:</strong> ${errorMessage}
                </div>
            `;
            
            structuredDigest.classList.remove('d-none');
            directoryStructureElement.innerHTML = '';
            repoNameElement.textContent = 'Error';
            repoDescriptionElement.textContent = errorMessage;
            repoStarsElement.textContent = '-';
            repoForksElement.textContent = '-';
            repoFilesElement.textContent = '-';
        }
    });
    
    // Display structured data in the enhanced UI
    function displayStructuredData(data) {
        // Repository info
        const repo = data.repository;
        repoNameElement.textContent = repo.fullName;
        repoDescriptionElement.textContent = repo.description;
        repoStarsElement.textContent = formatNumber(repo.stars);
        repoForksElement.textContent = formatNumber(repo.forks);
        repoFilesElement.textContent = formatNumber(data.fileStats.totalCount);
        
        // Directory structure
        directoryStructureElement.innerHTML = renderDirectoryStructure(data.directoryStructure);
        
        // Files content
        filesContentElement.innerHTML = '';
        
        data.files.forEach(file => {
            const fileElement = document.createElement('div');
            fileElement.className = 'file-content mb-4';
            
            const header = document.createElement('div');
            header.className = 'file-header';
            
            const filePath = document.createElement('div');
            filePath.innerHTML = `<i class="fas fa-file-code me-2"></i> ${file.path} <span class="ms-2 text-muted">${file.size}</span>`;
            
            const actions = document.createElement('div');
            actions.className = 'actions';
            actions.innerHTML = `
                <button class="btn btn-sm btn-outline-secondary copy-file-btn" data-file="${file.path}">
                    <i class="fas fa-copy"></i> Copy
                </button>
            `;
            
            header.appendChild(filePath);
            header.appendChild(actions);
            fileElement.appendChild(header);
            
            const fileBody = document.createElement('div');
            fileBody.className = 'file-body';
            
            if (file.error) {
                fileBody.innerHTML = `
                    <div class="alert alert-warning m-0">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        Error fetching content: ${file.error}
                    </div>
                `;
            } else {
                const pre = document.createElement('pre');
                const code = document.createElement('code');
                code.className = `language-${file.language}`;
                code.textContent = file.content;
                pre.appendChild(code);
                fileBody.appendChild(pre);
            }
            
            fileElement.appendChild(fileBody);
            filesContentElement.appendChild(fileElement);
        });
        
        // Initialize syntax highlighting
        document.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
        });
        
        // Add event listeners to copy file buttons
        document.querySelectorAll('.copy-file-btn').forEach(button => {
            button.addEventListener('click', event => {
                const filePath = button.getAttribute('data-file');
                const fileData = data.files.find(f => f.path === filePath);
                
                if (fileData && fileData.content) {
                    navigator.clipboard.writeText(fileData.content)
                        .then(() => {
                            const originalText = button.innerHTML;
                            button.innerHTML = '<i class="fas fa-check"></i> Copied!';
                            setTimeout(() => {
                                button.innerHTML = originalText;
                            }, 2000);
                        })
                        .catch(err => {
                            console.error('Failed to copy content: ', err);
                            alert('Failed to copy to clipboard. Please select and copy the text manually.');
                        });
                }
            });
        });
    }
    
    // Render directory structure as a tree
    function renderDirectoryStructure(dirStructure) {
        function buildTreeHtml(node, isRoot = false) {
            if (isRoot) {
                let html = '<div class="tree-view"><ul>';
                
                // Sort directories first, then files
                const sortedChildren = Object.entries(node.children).sort((a, b) => {
                    // If types are different (dir vs file), sort directories first
                    if (a[1].type !== b[1].type) {
                        return a[1].type === 'dir' ? -1 : 1;
                    }
                    // Otherwise sort alphabetically
                    return a[0].localeCompare(b[0]);
                });
                
                for (const [name, child] of sortedChildren) {
                    html += buildTreeHtml(child);
                }
                
                html += '</ul></div>';
                return html;
            }
            
            let html = '<li>';
            
            if (node.type === 'dir') {
                html += `<i class="fas fa-folder text-warning me-2"></i>${node.name}/`;
                
                if (Object.keys(node.children).length > 0) {
                    html += '<ul>';
                    
                    // Sort directories first, then files
                    const sortedChildren = Object.entries(node.children).sort((a, b) => {
                        // If types are different (dir vs file), sort directories first
                        if (a[1].type !== b[1].type) {
                            return a[1].type === 'dir' ? -1 : 1;
                        }
                        // Otherwise sort alphabetically
                        return a[0].localeCompare(b[0]);
                    });
                    
                    for (const [name, child] of sortedChildren) {
                        html += buildTreeHtml(child);
                    }
                    
                    html += '</ul>';
                }
            } else {
                const fileIcon = getFileIcon(node.name);
                const fileSize = formatFileSize(node.size);
                html += `<i class="${fileIcon} me-2"></i>${node.name} <small class="text-muted">(${fileSize})</small>`;
            }
            
            html += '</li>';
            return html;
        }
        
        return buildTreeHtml(dirStructure, true);
    }
    
    // Get appropriate icon for file type
    function getFileIcon(filename) {
        const extension = filename.split('.').pop().toLowerCase();
        
        const iconMap = {
            'md': 'fas fa-file-alt text-primary',
            'js': 'fab fa-js text-warning',
            'ts': 'fab fa-js text-primary',
            'jsx': 'fab fa-react text-info',
            'tsx': 'fab fa-react text-primary',
            'html': 'fab fa-html5 text-danger',
            'css': 'fab fa-css3 text-primary',
            'scss': 'fab fa-sass text-pink',
            'json': 'fas fa-code text-success',
            'py': 'fab fa-python text-primary',
            'java': 'fab fa-java text-danger',
            'go': 'fas fa-code text-info',
            'rb': 'fas fa-gem text-danger',
            'php': 'fab fa-php text-purple',
            'c': 'fas fa-code text-secondary',
            'cpp': 'fas fa-code text-secondary',
            'cs': 'fas fa-code text-success',
            'swift': 'fas fa-code text-orange',
            'kt': 'fas fa-code text-purple',
            'sh': 'fas fa-terminal text-dark',
            'bat': 'fas fa-terminal text-dark',
            'ps1': 'fas fa-terminal text-blue',
            'jpg': 'fas fa-image text-success',
            'jpeg': 'fas fa-image text-success',
            'png': 'fas fa-image text-success',
            'gif': 'fas fa-image text-warning',
            'svg': 'fas fa-image text-info',
            'pdf': 'fas fa-file-pdf text-danger',
            'doc': 'fas fa-file-word text-primary',
            'docx': 'fas fa-file-word text-primary',
            'xls': 'fas fa-file-excel text-success',
            'xlsx': 'fas fa-file-excel text-success',
            'ppt': 'fas fa-file-powerpoint text-danger',
            'pptx': 'fas fa-file-powerpoint text-danger',
            'zip': 'fas fa-file-archive text-warning',
            'rar': 'fas fa-file-archive text-warning',
            'tar': 'fas fa-file-archive text-warning',
            'gz': 'fas fa-file-archive text-warning'
        };
        
        return iconMap[extension] || 'fas fa-file text-secondary';
    }
    
    // Copy digest to clipboard
    copyBtn.addEventListener('click', () => {
        // Copy the structured digest or fall back to plain text
        let contentToCopy;
        
        if (!repoDigest.classList.contains('d-none')) {
            contentToCopy = repoDigest.textContent;
        } else {
            // Create a text representation of the structured data
            contentToCopy = generateTextDigest();
        }
        
        navigator.clipboard.writeText(contentToCopy)
            .then(() => {
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                }, 2000);
            })
            .catch(err => {
                console.error('Failed to copy text: ', err);
                alert('Failed to copy to clipboard. Please select and copy the text manually.');
            });
    });
    
    // Download digest as markdown
    downloadBtn.addEventListener('click', () => {
        // Get the content to download
        let content;
        
        if (!repoDigest.classList.contains('d-none')) {
            content = repoDigest.textContent;
        } else {
            // Create a text representation of the structured data
            content = generateTextDigest();
        }
        
        // Create a blob and download link
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `repo-digest-${new Date().toISOString().slice(0, 10)}.md`;
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    });
    
    // Generate a text version of the structured digest
    function generateTextDigest() {
        // This is a simplified version - you can expand it as needed
        const repoName = repoNameElement.textContent;
        const repoDesc = repoDescriptionElement.textContent;
        const stars = repoStarsElement.textContent;
        const forks = repoForksElement.textContent;
        const files = repoFilesElement.textContent;
        
        let text = `# Repository Analysis for ${repoName}\n\n`;
        text += `## Repository Overview\n`;
        text += `- Description: ${repoDesc}\n`;
        text += `- Stars: ${stars}\n`;
        text += `- Forks: ${forks}\n`;
        text += `- Files analyzed: ${files}\n\n`;
        
        // Add file contents
        text += `## Files Content\n\n`;
        document.querySelectorAll('.file-content').forEach(fileElement => {
            const path = fileElement.querySelector('.file-header').textContent.trim().split(' ')[0];
            const codeElement = fileElement.querySelector('code');
            
            text += `### ${path}\n`;
            
            if (codeElement) {
                text += '```\n';
                text += codeElement.textContent + '\n';
                text += '```\n\n';
            } else {
                text += 'Content not available\n\n';
            }
        });
        
        return text;
    }
    
    // Check API rate limit and show warning if necessary
    function checkRateLimit(rateLimitInfo) {
        if (!rateLimitInfo) {
            rateLimitAlert.classList.add('d-none');
            return;
        }
        
        const remaining = rateLimitInfo.remaining;
        requestsRemainingSpan.textContent = remaining;
        
        if (remaining < 10) {
            rateLimitAlert.classList.remove('d-none');
        } else {
            rateLimitAlert.classList.add('d-none');
        }
    }
    
    // Helper function to format numbers with commas
    function formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    
    // Helper function to format file size
    function formatFileSize(bytes) {
        if (typeof bytes !== 'number') return 'Unknown';
        
        if (bytes < 1024) {
            return bytes + ' B';
        } else if (bytes < 1024 * 1024) {
            return (bytes / 1024).toFixed(1) + ' KB';
        } else {
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        }
    }
    
    // Check for URL parameters to auto-load a repository
    function checkUrlParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        const repoUrl = urlParams.get('repo');
        
        if (repoUrl) {
            repoUrlInput.value = repoUrl;
            analyzeBtn.click();
        }
    }
    
    // Run URL parameter check on load
    checkUrlParameters();
}); 