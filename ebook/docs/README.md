# Documentation Index

Complete documentation for the AI Ebook Generator.

## Quick Links

- [README.md](../README.md) - Project overview and quick start
- [CLAUDE.md](../CLAUDE.md) - Developer guidance
- [AGENTS.md](../AGENTS.md) - AI agent guidance

## Documentation

### Getting Started

- **[README.md](../README.md)** - Installation, quick start, and basic usage
  - Features overview
  - Installation instructions
  - Environment configuration
  - Running the application
  - Troubleshooting

### Architecture & Design

- **[architecture.md](architecture.md)** - System architecture and design
  - Component overview
  - Pipeline stages
  - Data flow
  - Database schema
  - File system layout
  - Security architecture
  - Performance considerations

### API Reference

- **[api.md](api.md)** - Complete REST API documentation
  - Authentication
  - Endpoints
  - Request/response formats
  - Error handling
  - Rate limits
  - Webhooks
  - Code examples

### Security

- **[security.md](security.md)** - Security features and audit results
  - Security audit summary
  - Input validation
  - Path validation
  - SQL injection prevention
  - Command injection prevention
  - API security
  - Error handling
  - Compliance (OWASP Top 10)

### Testing

- **[testing.md](testing.md)** - Testing strategy and coverage
  - Test organization
  - Test categories (unit, integration)
  - Shared fixtures
  - Test patterns
  - Coverage analysis
  - Running tests
  - CI/CD integration

### Deployment

- **[deployment.md](deployment.md)** - Production deployment guide
  - Deployment options (systemd, Docker, manual)
  - Prerequisites
  - Installation steps
  - Nginx configuration
  - SSL setup
  - Monitoring
  - Backup and recovery
  - Troubleshooting

### Development

- **[logging-best-practices.md](logging-best-practices.md)** - Structured logging standards
  - Standard log fields
  - Usage examples
  - Error handling patterns
  - Correlation IDs

## Documentation by Role

### For Users

1. Start with [README.md](../README.md) for installation and quick start
2. Review [api.md](api.md) for API usage
3. Check [deployment.md](deployment.md) for production setup

### For Developers

1. Read [CLAUDE.md](../CLAUDE.md) for development workflow
2. Study [architecture.md](architecture.md) for system design
3. Review [testing.md](testing.md) for testing practices
4. Follow [logging-best-practices.md](logging-best-practices.md) for error handling

### For Security Auditors

1. Review [security.md](security.md) for security features
2. Check [testing.md](testing.md) for security test coverage
3. Examine [api.md](api.md) for authentication and rate limiting

### For DevOps Engineers

1. Follow [deployment.md](deployment.md) for production setup
2. Review [architecture.md](architecture.md) for system requirements
3. Check [api.md](api.md) for health check endpoints

### For AI Agents

1. Read [AGENTS.md](../AGENTS.md) for file structure and patterns
2. Review [CLAUDE.md](../CLAUDE.md) for commands and architecture
3. Check [testing.md](testing.md) for test requirements

## Documentation Standards

### File Naming

- Use lowercase with hyphens: `security-features.md`
- Be descriptive: `deployment.md` not `deploy.md`
- Group related docs in subdirectories when needed

### Content Structure

All documentation files should include:

1. **Title** - Clear, descriptive H1 heading
2. **Overview** - Brief introduction (1-2 paragraphs)
3. **Sections** - Logical organization with H2/H3 headings
4. **Code Examples** - Practical examples where applicable
5. **See Also** - Cross-references to related documentation

### Markdown Style

- Use fenced code blocks with language identifiers
- Include command descriptions in bash examples
- Use tables for structured data
- Add links to related documentation
- Keep line length reasonable (80-120 characters)

## Contributing to Documentation

### Adding New Documentation

1. Create file in `docs/` directory
2. Follow naming conventions
3. Include in this index
4. Add cross-references from related docs
5. Update README.md if user-facing

### Updating Existing Documentation

1. Keep changes focused and atomic
2. Update cross-references if structure changes
3. Maintain consistent formatting
4. Test all code examples
5. Update "Last Updated" date if present

### Documentation Review Checklist

- [ ] Clear and concise writing
- [ ] Code examples tested and working
- [ ] Internal links verified
- [ ] Cross-references added
- [ ] Formatting consistent
- [ ] No sensitive information (API keys, passwords)
- [ ] Spelling and grammar checked

## Version History

- **2026-04-21**: Initial documentation consolidation
  - Created comprehensive README.md
  - Updated CLAUDE.md with security refactor details
  - Updated AGENTS.md with current file structure
  - Created architecture.md
  - Created api.md
  - Created security.md
  - Created testing.md
  - Created deployment.md
  - Created this index

## Maintenance

Documentation should be updated when:

- New features are added
- Architecture changes
- API endpoints change
- Security features are modified
- Deployment process changes
- Test coverage changes significantly

## Feedback

For documentation improvements:
- Open an issue on GitHub
- Submit a pull request
- Contact the development team

---

**Last Updated**: 2026-04-21
