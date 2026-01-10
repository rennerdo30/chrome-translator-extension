# Contributing to AI Translator Extension

Thank you for your interest in contributing to the AI Translator Extension! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites

- Google Chrome or Chromium-based browser
- Node.js (v16 or higher) for icon generation
- Git for version control
- Basic knowledge of JavaScript, HTML, and CSS
- Understanding of Chrome Extension APIs (helpful but not required)

### Setting Up Development Environment

1. **Fork the repository** on GitHub

2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/ai-translator-extension.git
   cd ai-translator-extension
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Load the extension in Chrome**:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the project directory

## 🛠️ Development Workflow

### Making Changes

1. **Create a new branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**:
   - Edit the relevant files
   - Follow the existing code style
   - Add comments for complex logic
   - Test your changes thoroughly

3. **Test the extension**:
   - Reload the extension in `chrome://extensions/`
   - Test on multiple websites
   - Check console for errors (F12)
   - Verify all three providers work (if applicable)

4. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

### Commit Message Convention

We follow conventional commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

Examples:
```
feat: add support for custom API endpoints
fix: resolve API key not saving issue
docs: update README with troubleshooting section
style: improve popup UI spacing
refactor: simplify translation batching logic
```

## 📋 Pull Request Process

1. **Update documentation**: If you've added features, update README.md and CLAUDE.md

2. **Test thoroughly**:
   - Test with LM Studio, Ollama, and OpenAI
   - Test on different types of websites
   - Verify no console errors

3. **Submit pull request**:
   - Push your branch to your fork
   - Create a pull request from your branch to `main`
   - Provide a clear description of changes
   - Reference any related issues

4. **Review process**:
   - Maintainers will review your PR
   - Address any feedback or requested changes
   - Once approved, your PR will be merged

## 🎨 Code Style Guidelines

### JavaScript

- Use `const` for constants, `let` for variables (avoid `var`)
- Use async/await instead of Promise chains
- Add JSDoc comments for functions
- Keep functions small and focused
- Use descriptive variable names

Example:
```javascript
/**
 * Translates text using the selected AI provider
 * @param {string} text - Text to translate
 * @param {string} targetLanguage - Target language
 * @returns {Promise<string>} Translated text
 */
async function translateText(text, targetLanguage) {
  const { baseUrl, headers, model } = await getProviderSettings();
  // ...
}
```

### HTML/CSS

- Use semantic HTML elements
- Keep CSS organized and commented
- Use CSS variables for colors and spacing
- Ensure responsive design
- Follow existing naming conventions

### Extension Structure

- **background.js**: Only API calls and background tasks
- **content.js**: Only DOM manipulation and page interaction
- **popup.js**: Only UI logic and settings management
- Keep files focused on their purpose

## 🐛 Reporting Bugs

### Before Submitting a Bug Report

- Check existing issues to avoid duplicates
- Test with the latest version
- Verify the bug occurs in a clean browser profile

### Bug Report Template

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce:
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment**
- Browser: [e.g., Chrome 120]
- Extension version: [e.g., 1.0.0]
- AI Provider: [e.g., LM Studio]
- OS: [e.g., macOS 14]

**Additional context**
Any other relevant information.
```

## 💡 Feature Requests

We welcome feature suggestions! Please:

1. Check if the feature has already been requested
2. Clearly describe the feature and its benefits
3. Provide use cases and examples
4. Consider implementation complexity

## 📝 Documentation

Good documentation is crucial:

- Update README.md for user-facing changes
- Update CLAUDE.md for AI assistant guidance
- Add code comments for complex logic
- Include JSDoc for public functions
- Update architecture diagrams if needed

## 🧪 Testing Guidelines

### Manual Testing Checklist

- [ ] Extension loads without errors
- [ ] All three providers work correctly
- [ ] Translation works on various websites
- [ ] Original text restoration works
- [ ] Settings are saved and persist
- [ ] Context menu works
- [ ] Connection test works
- [ ] Model refresh works (for LM Studio/Ollama)
- [ ] No console errors

### Testing Different Scenarios

1. **Different Providers**:
   - Test with LM Studio
   - Test with Ollama
   - Test with OpenAI

2. **Different Content Types**:
   - Simple text pages
   - Dynamic/JavaScript-heavy sites
   - Pages with mixed content
   - Pages with forms

3. **Edge Cases**:
   - Very long text
   - Pages with special characters
   - Empty pages
   - Pages with iframes

## 🔧 Icon Development

If you modify the icon:

1. Edit `icons/icon.svg`
2. Regenerate PNGs:
   ```bash
   npm run generate-icons
   ```
3. Verify all sizes (16px, 48px, 128px) look good

## 🌐 Internationalization (Future)

While not currently implemented, we plan to support:
- Multi-language UI
- Localized error messages
- Regional preferences

## 📞 Getting Help

- Open an issue for questions
- Check existing documentation
- Review closed issues for similar problems

## 🎖️ Recognition

Contributors will be recognized in:
- GitHub contributors list
- Release notes for significant contributions
- README acknowledgments section

## 📜 Code of Conduct

### Our Standards

- Be respectful and inclusive
- Accept constructive criticism
- Focus on what's best for the community
- Show empathy towards others

### Unacceptable Behavior

- Harassment or discrimination
- Trolling or inflammatory comments
- Personal or political attacks
- Publishing others' private information

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing! 🎉
