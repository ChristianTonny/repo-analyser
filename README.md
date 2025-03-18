# GitHub Repository Analyzer

A web application that allows users to analyze a GitHub repository and generate a text-based digest of its codebase. This tool is useful for summarizing repositories for AI models, making it easier to extract structured insights.

## Features

- Enter a GitHub repository URL
- Filter files by type, directory, and maximum file size
- Quick-access buttons for example repositories
- Clean, structured repository digests
- Rate limit monitoring for GitHub API

## Project Structure

```
project/
├── public/              # Frontend files
│   ├── index.html       # Main HTML file
│   ├── css/
│   │   └── styles.css   # Custom CSS styles
│   └── js/
│       ├── main.js      # Main frontend JavaScript
│       └── github-api.js # GitHub API client
└── server/              # Backend files
    ├── server.js        # Express server
    ├── routes/
    │   └── github.js    # GitHub API routes
    └── package.json     # Backend dependencies
```

## Setup Instructions

### Prerequisites

- Node.js (v14 or later)
- npm

### Installation

1. Clone this repository
2. Install backend dependencies:
   ```
   cd server
   npm install
   ```

### Running the Application

1. Start the server:
   ```
   cd server
   npm start
   ```
2. Open your browser and navigate to [http://localhost:3000](http://localhost:3000)

## Technical Details

### Frontend

- Pure HTML, CSS, and JavaScript (no frameworks)
- Bootstrap for styling
- Responsive design for various screen sizes

### Backend

- Node.js with Express.js
- GitHub API integration
- Rate limit monitoring

### GitHub API Integration

This application uses the public GitHub API without authentication, which has a rate limit of 60 requests per hour. The application monitors this rate limit and provides feedback to the user.

## Rate Limit Considerations

Since the application uses unauthenticated GitHub API requests, it's subject to a limit of 60 requests per hour. The application:

1. Shows a warning when approaching the rate limit
2. Limits the number of files fetched to avoid hitting the limit quickly
3. Displays the remaining requests to the user

For increased rate limits (up to 5,000 requests per hour), GitHub OAuth authentication can be implemented in future versions.

## Future Enhancements

- Add GitHub OAuth authentication to increase API rate limits
- Implement caching to reduce API requests
- Add visualization of the repository structure
- Support for comparing multiple repositories 