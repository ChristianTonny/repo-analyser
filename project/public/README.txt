# GitHub Repository Analyzer - Direct Access Instructions

This application can be used directly by opening the index.html file in your browser.

## Important Notes

1. When used directly from the file system (not through a web server), the application will:
   - Call the GitHub API directly from your browser
   - Be subject to GitHub's API rate limits (60 requests per hour)
   - Have some functionality limitations compared to the server version

2. For full functionality and higher API rate limits, please run the application using the Node.js server:
   - Navigate to the 'server' directory in a terminal
   - Run 'npm install' to install dependencies
   - Run 'npm start' to start the server
   - Access the application at http://localhost:3000

## Using Direct Access Mode

1. Simply open the index.html file in your browser
2. Enter a GitHub repository URL or click one of the example repository buttons
3. Set any filtering options you want
4. Click "Analyze" to fetch and analyze the repository

## Troubleshooting

If you encounter errors:
- Ensure you're connected to the internet
- Check that the repository URL is correct and the repository is public
- If you hit rate limits, wait an hour before trying again
- For the best experience, use the server version of the application 