
// override fetch to intercept job data requests

const log = window.console.log.bind(window.console, 'Transfix: %s');

log("Hello from the Transfix metadata embed for Midjourney!");

const imageUrlToBase64 = async url => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((onSuccess, onError) => {
    try {
      const reader = new FileReader();
      reader.onload = function(){ onSuccess(this.result) } ;
      reader.readAsDataURL(blob) ;
    } catch(e) {
      onError(e);
    }
  });
};

function jobIdFromLocation() {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const pathname = document.location.pathname;
  if (pathname.includes("/app/jobs")) {
    // extract jobid and validate path
    const [_empty, _app, _jobs, jobId, ...rest] = pathname.split("/");
    if (!jobId.match(uuidRegex)) {
      log("Missing job ID");
      return undefined;
    }
    return jobId;
  }
  return undefined;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
const jobs = [];
async function getJobs () {
  const pathname = window.location.pathname;
  log("Jobs lookup");
  jobs.length = 0; // remove old jobs list
  try {
    if (pathname.match("/showcase/recent/")) {
    return JSON.parse(document.getElementById("__NEXT_DATA__").innerText).props.pageProps.jobs;
  } else if (pathname.includes("/app/jobs")) {

    // first get job status then hit search API for the job
    const jobId = jobIdFromLocation();
    if (!jobId) {
      log("Missing job ID");
      return [];
    }

    const jobStatusURL = "https://www.midjourney.com/api/app/job-status";
    const jobStatus = await fetch(jobStatusURL, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({ "jobIds": [ jobId ] })
    });
    if (!jobStatus.ok) {
      log("Unable to fetch job status");
      return [];
    }
    const job = await jobStatus.json();
    // Add the current page as a job
    jobs.push(job);

    const searchURL = new URL("https://www.midjourney.com/api/app/vector-search/");
    const imgPath = job.image_paths[0].replace("https://storage.googleapis.com/dream-machines-output", "https://cdn.midjourney.com");
    const params = {
      "amount": "50",
      "dedupe": "true",
      "jobStatus":"completed",
      "jobType":"upscale",
      "orderBy":"new",
      "searchType":"vector",
      "prompt": imgPath
    };
    for ([k, v] of Object.entries(params)) {
      searchURL.searchParams.append(k, v);
    }
    console.log("Requesting", searchURL);
    const zz = await fetch(searchURL);
    const body = await zz.json();
    jobs.push(...body);
    log("Jobs are now", jobs);
  } else if (pathname === "/app/search/") {
    log("TODO search");
  } else if (pathname === "/app/") {
      log("In user homepage");
      // first get user id
      const userSessionURL = new URL("https://www.midjourney.com/api/auth/session/");
      const userInfoResp = await fetch(userSessionURL);
      if (!userInfoResp.ok) {
        log("Error fetching user info", userInfoResp);
        return [];
      }
      const userInfo = await userInfoResp.json();
      log("Got user info");
      // at the user's homepage
      const recentJobsURL = new URL("https://www.midjourney.com/api/app/recent-jobs/");
      const params = {
        "amount": "35",
        "dedupe":"true",
        "jobStatus":"completed",
        "jobType":"upscale",
        "orderBy":"new",
        "prompt":undefined,
        "refreshApi":0,
        "searchType":"advanced",
        "service":null,
        "type":"all",
        "userId": userInfo.user.id,
        "user_id_ranked_score":null,
        "_ql":"todo",
        "_qurl":window.location.href
      };
      for (const [k, v] of Object.entries(params)) {
        recentJobsURL.searchParams.append(k, v);
      }
      const recentJobsResp = await fetch(recentJobsURL);
      if (!recentJobsResp.ok) {
        log("Unable to retrieve recent jobs", recentJobsResp);
        return [];
      }
      recentJobs = await recentJobsResp.json();
      jobs.push(...recentJobs);
      log("Set recent jobs");
  } else {
    console.log("Transfix: unhandled page", window.location.href);
    return [];
  }
  } catch (e) {
    return [];
  }
  log("Jobs assigned:", jobs.length);
}

// populate jobs on initial load
getJobs();

// Function to attach event handler
const bla = {};
function attachThumbnailEventHandler(element, img) {
  const jobId = img.getAttribute("data-job-id");
  if (!jobId) return;

  // prevent duplicates
  if (bla[jobId]) return;
  bla[jobId] = true;

  element.addEventListener('mouseover', function() {
    // Handle the click event here
    console.log('Image Mouse Over:', img.src);
    chrome.runtime.sendMessage({mouseOverImage: jobId});
    // You can perform any actions you want with the clicked image
  });
  element.addEventListener('mouseout', function(){
    console.log("Image Mouse Out:", img.src);
    chrome.runtime.sendMessage({mouseOverImage: "remove"});
  });
}

// Function to check if an element has the specified class
function hasClass(element, className) {
  return element.classList.contains(className);
}

// Function to handle the mutation
let oldHref = document.location.href;
function handleMutation(mutationsList) {

  // Reset jobs if necessary; SPA changes the contents and URL but doesn't reload
  if (oldHref !== document.location.href) {
    oldHref = document.location.href;
    getJobs();
  }

  mutationsList.forEach(function(mutation) {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const modalImages = node.querySelectorAll('img.modalImage:not(.blur-2xl)');
          for (const imgElement of modalImages) {
            // NB this will probably break if there is > 1 match
            attachModalMouseoverHandler(imgElement);
          }
          /*
          const imgElements = node.querySelectorAll('img.aspect-auto');
          imgElements.forEach(function(img) {
            // oh no
            const target = img.parentElement.parentElement.parentElement.parentElement.querySelector('.cursor-pointer > .absolute.inset-0');
            attachThumbnailEventHandler(target, img);
          });
        */
        }
      });
    }
  });
}

// Create a MutationObserver to watch for DOM changes
const observer = new MutationObserver(handleMutation);

// Start observing the document body for mutations
observer.observe(document.body, { childList: true, subtree: true });


function attachModalMouseoverHandler(imgElement, idx) {
  const jobId = jobIdFromLocation();
  if (!jobId) {
    log("No job ID found; not attaching mouseover handler");
    return;
  }
  imgElement.setAttribute("data-job-id", jobId);
  imgElement.addEventListener("mouseover", (e) => {
    chrome.runtime.sendMessage({mouseOverImage: jobId});
  });
  imgElement.addEventListener("mouseout", (e) => {
    chrome.runtime.sendMessage({mouseOverImage: "remove"});
  });
  log("Adding modal image handler for", jobId);
}

document.onmouseover = function(e) {
  if (!e.target.parentElement || !e.target.parentElement.parentElement) return true;
  const t = e.target.parentElement.parentElement.querySelector('img.aspect-auto');
  if (!t) {
    return true;
  }
  const id = t.getAttribute("data-job-id");
  if (!id) {
    console.log("no job id found here");
    return true;
  }
  if (!e.target.getAttribute('data-tfx-mouseout-handler')) {
    e.target.addEventListener('mouseout', () => {
      (async () => {
        chrome.runtime.sendMessage({mouseOverImage: "remove"});
      })();
    });
    e.target.setAttribute('data-tfx-mouseout-handler', id);
  }
  (async () => {
    chrome.runtime.sendMessage({mouseOverImage: id});
  })();
  return true;
}

async function getJob(jobId){
  try {
    log("Getting job status for", jobId);
    const jobIds = Array.isArray(jobId) ? jobId : [ jobId ]
    const jobStatusURL = "https://www.midjourney.com/api/app/job-status/";
    const jobStatus = await fetch(jobStatusURL, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({ "jobIds": jobIds })
    });
    if (!jobStatus.ok) {
      log("Unable to fetch job status");
      return undefined;
    }
    return jobStatus.json();
  } catch(e) {
    console.error("Error getting job status for ", jobId, e);
    return undefined;
  }
}

// download request for an individal image
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    const jobId = request.metadataTarget;
    log("Metadata target being ", jobId);
    let job = jobs.find(j => j.id === jobId);
    if (!job) {
      // job not found in bulk query so try to get it individually
      log("Did not find job, fetching individual");
      job = await getJob(jobId);
      if (!job) return;
    }
    log("Found job ", job);
    const elem = document.querySelector('img[data-job-id="'+jobId+'"]');
    const imageURL = elem.currentSrc;
    const imageData = await imageUrlToBase64(imageURL)
    const response = await chrome.runtime.sendMessage({job: job, imageURL: imageURL, imageDataURL: imageData});
    log("got res", response);
    sendResponse({res: "ok"});

    // fake the download
    const enrichedImage = await (await fetch(response.enrichedImage)).blob();
    var e = document.createElement('a');
    e.href = URL.createObjectURL(enrichedImage);
    e.download = response.filename;
    e.click();
    URL.revokeObjectURL(e.href);
  })();
  return true;
});
