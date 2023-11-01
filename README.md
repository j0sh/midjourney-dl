# Midjourney Image Downloader for Google Chrome

Download Midjourney images and prompts with this extension for Google Chrome.

🚨 This extension only works on the legacy.midjourney.com site 🚨

This extension will be left as-is and won't be updated for the current website. The source code is posted here for informational purposes. If someone wants to try and make a downloader with the new website, feel free to fork this repo or use it as a reference, and make a new app.

[Chrome Store listing](https://chrome.google.com/webstore/detail/download-midjourney-image/cpkamhjpemhjiehaanmfkffagnppmoaj) - will be taken offline once the legacy site goes offline, or if things bit-rot to the point that the extension is unusable.

## Store Description

Easily download images and prompts from the Midjourney website with a right-click. Prompts are stored as metadata within the images, so you can never lose prompts as long as you have the original image.

Images can be downloaded from any page on the Midjourney website - either single images, or bulk downloads of all images. Download from archive pages, search results, showcases, job and similarity results, user pages and more.

The archive page downloader has extensive additional features:
  📅 Date-based download ranges
  🗄️ Download upscaled images, original grids, or both
  ✂️ Grids can be split into separate images without upscaling (v5+)
  🖼️ Download images in PNG or WebP format
  ⚙️ Metadata-only CSV or JSONL download option

Additionally, this extension contains functionality that has been lost from the Midjourney native downloader:
  🏅 High reliability. Download thousands of images in one zip
  📁 Date-based or user selectable zip file names - no more UUIDs!
  ⏰ Image timestamps match job time

This extension is completely safe to use with Midjourney stealth mode - the prompts and images are processed entirely locally and never leave your computer. 🛡️

For developers, images also include additional metadata from Midjourney in a nicely structured JSON format. This data includes the parsed job parameters, job creation time, model used, image dimensions, full prompt and image weights, and so on.
