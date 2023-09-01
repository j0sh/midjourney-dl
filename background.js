import WriterInit from './writer.js'

const uint8ArrayToBase64 = async (blob) => {
  return new Promise((onSuccess, onError) => {
    try {
      const reader = new FileReader();
      reader.onload = function(){ onSuccess(this.result) } ;
      reader.readAsDataURL(new Blob([blob.buffer]));
    } catch(e) {
      onError(e);
    }
  });
};

chrome.action.onClicked.addListener(function (tab) {
  console.log("Transfix: Extension clicked", tab)
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: [ "downloadZip.js" ],
  });
});

const SingleImageContextMenuID = "1";
const AllImagesContextMenuID = "2";

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;

  //  ping-pong back over to the content script
  (async () => {
    switch (info.menuItemId) {
    case SingleImageContextMenuID:
      await chrome.tabs.sendMessage(tab.id, { metadataTarget: mouseOverImage });
      break;
    case AllImagesContextMenuID:
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [ "downloadZip.js" ],
      });
      break;
    default:
      console.log("Transfix: Unknown context menu clicked ", info);
    }
  })();
  return true;
});

chrome.contextMenus.removeAll(function() {
  console.log("Transfix: Removing context menus");
  chrome.contextMenus.create({
    id: AllImagesContextMenuID,
    title: "Save All Images On Page",
    contexts:["page", "image"],  // ContextType
    documentUrlPatterns: ["https://www.midjourney.com/*"],
  });
})

async function embedMetadata(request, sender, sendResponse){
  const imageURL = request.imageURL;
  const imageDataURL = request.imageDataURL;
  const j = request.job;
  const imageData = new Uint8Array(await (await fetch(imageDataURL)).arrayBuffer());
  const w = await WriterInit();
  const dc = {
    "dc.publisher" : "Midjourney",
    "dc.contributor": "Transfix Metadata Embed",
    "dc.creator" : j.username,
    "dc.date" : j.enqueue_time,
    "dc.title" : j.full_command,
    "dc.identifier" : j.id,
    "dc.source" : j.reference_job_id,
    "dc.subject" : j.prompt || "",
    "midjourney.midjourneyJobData" : JSON.stringify(j),
    "xmp.BaseURL" : request.imageURL,
    "xmp.CreateDate" : new Date(j.enqueue_time + " UTC").toISOString().replaceAll(/[TZ]/ig, ' ').trimEnd(),
    "xmp.CreatorTool" : "Midjourney",
  }
  const p = w.writer(imageData, dc);
  const pData = await uint8ArrayToBase64(p);

  const name = `${j.username}_${(j.prompt || "").toLowerCase()}`.replace(/[^a-zA-Z0-9 \.\-_]/g, '').replace(/ /g, '_');
  const idx = j.split_index !== undefined ? '_'+j.split_index : ''; // indicate position if part of split grid
  const ext = imageURL.split(".").at(-1);
  const fname = `${name.substring(0, 100 - j.id.length - 1)}_${j.id}${idx}.${ext}`;

  const mtime = j.enqueue_time;

  sendResponse({res: "ok", enrichedImage: pData, filename: fname, mtime: mtime, job: j});
}

let mouseOverImage = "";
async function storeMouseOver(request, sender, sendResponse) {
  mouseOverImage = request.mouseOverImage;
  console.log("Setting ", mouseOverImage);
  if (mouseOverImage === "remove") {
    console.log("Transfix: Removing menu item");
    chrome.contextMenus.remove(SingleImageContextMenuID);
  } else {
    console.log("Transfix: Adding menu item");
    chrome.contextMenus.create({
      id: SingleImageContextMenuID,
      title: "Save Single Image",
      contexts:["page", "image"],  // ContextType
      documentUrlPatterns: ["https://www.midjourney.com/*"],
    });
  }
  sendResponse(); // send empty response to suppress errors in the console
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    if (request.imageURL) {
      return await embedMetadata(request, sender, sendResponse);
    }
    if (request.mouseOverImage) {
      return storeMouseOver(request, sender, sendResponse);
    }
    return {res: "unknown request"};
  })();
  return true;
});
