# Chart AI Copilot — Installation & Usage Guide

Version 0.3.0

---

## Load as Unpacked Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the project root folder: the directory that contains `manifest.json`
5. The Chart AI Copilot icon will appear in your Chrome toolbar

To reload after code changes, click the refresh icon on the extension card at `chrome://extensions`.

---

## Configure API Keys

1. Click the Chart AI Copilot icon in the toolbar to open the popup
2. Go to **Settings**
3. Enter your API key for the provider you want to use:
   - **Anthropic Claude** — obtain at https://console.anthropic.com
   - **MiniMax** — obtain at https://www.minimaxi.com or https://api.minimax.io
4. Select your preferred model and save

API keys are stored locally in Chrome's `storage` API and never sent anywhere other than the respective AI provider endpoint.

---

## Supported Platforms

| Platform | URL |
|---|---|
| TradingView | https://www.tradingview.com |
| Binance | https://www.binance.com and https://www.binance.us |
| Yahoo Finance | https://finance.yahoo.com |
| Investing.com | https://www.investing.com |

Navigate to any chart page on one of these platforms and the extension activates automatically.

---

## How to Use Batch Scan

Batch scan lets you analyze multiple charts in sequence without manual intervention.

1. Navigate to a supported platform and open a chart
2. Click the Chart AI Copilot icon and open the **Sidebar** (or use the sidebar toggle on the page)
3. Select **Batch Scan** from the sidebar menu
4. Add the symbols or chart URLs you want to scan
5. Click **Start Batch Scan** — the extension will capture and analyze each chart in turn
6. When complete, results are collected in the sidebar and can be exported

Use **Batch Export** to download all batch results as a JSON or CSV file for further analysis.

---

## How to Create Custom Prompt Templates

You can replace the built-in analysis prompt with your own.

1. Open the extension popup and go to **Settings > Prompt**
2. Write your custom prompt in the text area. Use the following placeholders if needed:

   | Placeholder | Replaced with |
   |---|---|
   | `{platform}` | Detected platform name |
   | `{symbol}` | Chart symbol / ticker |
   | `{timeframe}` | Current chart timeframe |

3. Click **Save Template**
4. To revert to the default prompt, click **Reset to Default**

Custom templates are stored locally and persist across browser sessions.

---

## Package for Distribution

Run the build script from PowerShell in the project root:

```powershell
.\scripts\build.ps1
```

This validates all required files, then creates `dist\chart-ai-copilot-v0.3.0.zip` ready for upload to the Chrome Web Store developer dashboard.
