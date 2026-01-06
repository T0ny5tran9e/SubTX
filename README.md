# SubTX - Edge Subtitle Extractor

A Microsoft Edge extension that extracts and downloads subtitles from various embedded streaming platforms.

**Recently Optimized Version**: Cleaned codebase with ~400KB size reduction, eliminated duplicate functions, and improved performance.

## Features

- **Multi-Platform Support**: Extracts subtitles from YouTube, Vimeo, JW Player, OneStream, 2embed, multiembed, moviesapi, Voe, Vidsrc, doodstream, and mixdrop.
- **Smart Language Detection**: Automatically detects subtitle language using content analysis.
- **Multiple Formats**: Download subtitles in SRT, VTT, or TXT formats.
- **Terminal-Style UI**: Clean, retro terminal interface using WebTUI styling.
- **Bulk Selection**: Select multiple subtitles with checkboxes for batch operations.
- **Format Conversion**: Convert subtitles to different formats during download.
- **Easy Downloads**: One-click download with automatic format conversion.
- **Advanced Filtering**: Sophisticated URL filtering with confidence scoring.

## Installation

### From Source

1. Clone or download this repository
2. Open Microsoft Edge and navigate to `edge://extensions/`
3. Enable "Developer mode" in the bottom left
4. Click "Load unpacked" and select the extension folder
5. The SubTX extension should now appear in your extensions list

### Permissions Required

- **activeTab**: To access the current tab for subtitle detection
- **downloads**: To save subtitle files to your device
- **storage**: To store extension settings
- **webRequest**: To monitor network requests for subtitle detection
- **Host permissions**: Access to all websites (`*://*/*`) for subtitle extraction

## Usage

1. Navigate to a video page on a supported platform
2. Click the SubTX extension icon in your browser toolbar
3. The extension will scan for available subtitles
4. Select your desired language and format
5. Click download to save the subtitle file

## Supported Platforms

### Native Support
- **YouTube**: Extracts from video player captions
- **Vimeo**: Uses Vimeo Player API for subtitle detection
- **JW Player**: Leverages JW Player's caption API

### Embedded Players
- **OneStream**: Detects video elements and text tracks
- **2embed**: Handles iframe-based players
- **multiembed, moviesapi, Voe, Vidsrc, doodstream, mixdrop**: Generic video element detection

## Language Detection

The extension extracts language information from subtitle URLs and metadata. For advanced detection, it can analyze subtitle content, though this feature may be limited in some browsers.

## Formats

- **VTT (WebVTT)**: Native web subtitle format
- **SRT**: Standard subtitle format for most players
- **TXT**: Plain text extraction of subtitle content

## Development

### Prerequisites
- Node.js and npm (for testing)
- Chrome or Edge browser

### Setup
```bash
npm install
```

### Building
The extension uses vanilla JavaScript with ES modules. No build step required.

### Testing
```bash
npm test
```

Playwright tests are included for comprehensive functionality testing. Recently optimized test suite with improved reliability.

### Codebase Structure
The project now includes detailed documentation in hierarchical AGENTS.md files for better understanding of the codebase organization.

## Architecture

- **Manifest V3**: Modern Edge extension format
- **Content Script**: Injects into web pages for fallback subtitle detection
- **Popup UI**: Full WebTUI terminal interface with window frame, panels, and controls
- **Background Service Worker**: Monitors network requests and handles downloads
- **Network Monitoring**: Uses chrome.webRequest API to intercept subtitle requests
- **Edge Optimized**: Compatible JavaScript without modern features for Edge stability

## WebTUI Design System

The extension implements a complete **WebTUI (Web Terminal User Interface)** design system, providing an authentic terminal experience with:

### Terminal Window Components
- **Window Frame**: Classic terminal window with title bar and controls
- **Command Prompt**: Interactive prompt showing current operation (`$ subtx --scan`)
- **Status Bar**: Real-time status and subtitle counter display
- **Panel System**: Organized content areas with terminal-style headers
- **Button Variants**: Primary, secondary, warning, and info button styles

### Color Palette (Dracula-Inspired)
- **Background**: #141D2B (Terminal background)
- **Panels**: #1A2332 (Content panels)
- **Accent**: #9FEF00 (Terminal green)
- **Text**: #F8F8F2 (Primary text)
- **Borders**: #44475A (Panel borders)
- **Success**: #50FA7B (Success indicators)
- **Warning**: #F1FA8C (Warning states)
- **Error**: #FF5555 (Error states)
- **Info**: #8BE9FD (Information)

### Typography
- **Font Family**: JetBrains Mono (monospace terminal font)
- **Header Decorations**: ASCII box-drawing characters (`┌─ ─┐`)
- **Terminal Controls**: Minimize (─), Maximize (⬜), Close (✕)
- **Button Icons**: Contextual emojis (🔄, 📋, 🗑️, ⚙️)

### Component Structure
```
┌─ SubTX v1.0.0 ───┐
│                  │
│ Ready      Sub: 0│
│                  │
│ ┌─ System Info ──┐
│ │ Requests: 0    │
│ │ Subtitles: 0   │
│ └────────────────┘
│                  │
│ ┌─ Results ──────┐
│ │☐ Eng (95%) VTT│
│ │  example.com.. │
│ │☑ Spa (87%) SRT│
│ │  cdn.net/sub.. │
│ │   [Scroll]     │
│ └────────────────┘
│                  │
│ ┌─ Bulk Actions ─┐
│ │ Format: [VTT ▼]│
│ │ [📥 Download]   │
│ │ [📋 Copy Links] │
│ └────────────────┘
│                  │
│ [🔄] [📋] [⚙️]   │
│   [🗑️ Clear]     │
└──────────────────┘
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is open source. The code is available under the MIT License.

## Troubleshooting

### No subtitles found
- Ensure the video has embedded subtitles
- Try refreshing the page and scanning again
- Check browser console for error messages

### Download fails
- Verify download permissions are granted
- Check if the subtitle URL is accessible
- Ensure sufficient disk space

### Language detection issues
- Some subtitle files may not have enough text for accurate detection
- Fallback to manual language selection if needed

### Post-Cleanup Issues
- If experiencing any issues after the recent cleanup, try reinstalling the extension
- Clear browser cache and extension data if subtitle detection seems inconsistent