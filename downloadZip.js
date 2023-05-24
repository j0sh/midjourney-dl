
function addOverlay(overlayId){
  const d = document.createElement("div");
  d.style = "position: fixed; top: 0; right: 0; background-color: rgb(248 113 113);  padding: 1em; z-index: 100";
  d.innerText = "Preparing Download ...";
  d.id = overlayId;
  document.body.appendChild(d);
}
function updateOverlay(overlayId, s) {
  document.getElementById(overlayId).innerText = s;
}
function removeOverlay(overlayId){
  return function() { document.getElementById(overlayId).remove() };
}

// NB this is executed in page content context
(async function() {

  // TODO bundle
  const src = chrome.runtime.getURL('fflate.js');
  const fflate = await import(src);

  const imagesToDownload = document.querySelectorAll('img[data-job-id]');
  log("Processing ", imagesToDownload.length, "images");
  if (imagesToDownload.length <= 0) {
    log("No jobs to process");
    return;
  }

  // we have some jobs from the initial page load
  // but this doesnt always reflect what is on the page
  // so download the jobs that we are missing
  function jobsThatNeedAStatus() {
    missingJobs = new Set();
    const jobsOnPage = new Set(Array.from(imagesToDownload, (m) => m.getAttribute('data-job-id')));
    const currentJobs = new Set(jobs.map(j => j.id));
    for (let elem of jobsOnPage) {
      if (!currentJobs.has(elem)) {
        missingJobs.add(elem);
      }
    }
    return [...missingJobs];
  }
  const jobStatusRequest = getJob(jobsThatNeedAStatus());

  const ts = new Date().getTime();
  const overlayId = "transfixProgressOverlay" + ts;
  const today = new Date().toISOString().split("T")[0];
  const zipName = `midjourneyDownload_${today}_${ts}`;
  const fileHandle = await window.showSaveFilePicker({
    suggestedName: zipName+".zip",
    types: [{
      description: 'Zip',
      accept: {
        'application/zip': ['.zip'],
      },
    }],
  });
  addOverlay(overlayId);
  const writable = await fileHandle.createWritable();
  const zipper = new fflate.Zip((err, dat, final) => {
    if (err) {
      log("zip error", err);
      return;
    }
    // TODO does this need to be awaited ?
    writable.write(dat);
    if (final) {
      // TODO awaited ?
      writable.close();
      updateOverlay(overlayId, "All images downloaded");
      setTimeout(removeOverlay(overlayId), 5000);
    }
  });

  let jobCounter = 0;
  const downloadJobs = [...jobs].concat(await jobStatusRequest);
  async function processImage(iterator) {
    for (const imageElem of iterator) {
      const jobId = imageElem.getAttribute("data-job-id");
      if (!jobId) {
        log("Unable to find ", jobId);
        return;
      }
      let job = downloadJobs.find(j => j.id === jobId);
      if (!job) {
        // job not found in bulk query so try individually
        job = await getJob(jobId);
        if (!job) {
          log("Unable to get job info for", jobId);
          return;
        }
      }
      const imageURL = imageElem.currentSrc;
      const imageData = await imageUrlToBase64(imageURL)
      const response = await chrome.runtime.sendMessage({job: job, imageURL: imageURL, imageDataURL: imageData});
      log("res", job.id, response.res);
      const imageFile = new fflate.ZipPassThrough(zipName+"/"+response.filename);
      zipper.add(imageFile);
      const enrichedImage = new Uint8Array(await (await fetch(response.enrichedImage)).arrayBuffer());
      imageFile.push(enrichedImage, true);
      jobCounter++;
      updateOverlay(overlayId, `Processed ${jobCounter} / ${imagesToDownload.length} images`);
    }
  }

  const concurrency = 3;
  const iterator = imagesToDownload.values();
  const workers = new Array(concurrency).fill(iterator).map(processImage);
  const start = new Date();
  await Promise.all(workers);
  const end = new Date();

  log("Elapsed=", end - start, "concurrency=", concurrency);

  zipper.end();
})();
