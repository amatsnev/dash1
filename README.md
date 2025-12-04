# Dashboard Application

Simple dashboard for url-based services with YAML configuration. 
Features:
- quick search
- tag-based filtering
- simple icons ( selfh.st , simpleicons )
- mobile view

## Setup

### With Docker Compose
```bash
docker-compose up
```

### Running Locally
```bash
cd app
npm install
node server.js
```

Dashboard will be available at `http://localhost:3000`

## Configuration

Services are defined in YAML files in the `/config` directory.

### config.yaml - Group services by tags
```yaml
groups:
  - name: Infrastructure
    tagFilter: [infrastructure, proxy]
  - name: Security
    tagFilter: [security, auth]
```

### services.yaml - Define services
```yaml
services:
  - name: Example Service
    description: Service description
    url: https://example.com
    tags: [example, tools]
    icon: si-service
```