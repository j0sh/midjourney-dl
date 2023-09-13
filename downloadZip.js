async function getJobsByDay(date, userId){
  const url = new URL("https://www.midjourney.com/api/app/archive/day/");
  const params = {
    "day": date.d,
    "month": date.m,
    "year": date.y,
    "includePrompts": "true"
  }
  const userPathRegex = /\/users\/([0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12})\//i;
  const found = document.location.pathname.match(userPathRegex);
  if (found && found.length >= 2) params["userId"] = found[1];
  return await fetchURLWithParams(url, params);
}

function makeGenerator () {
  let resolver = (arg0) => { };
  const promise = new Promise(resolve => resolver = resolve);
  let closer = (arg0) => { };
  const closePromise = new Promise(resolve => closer = resolve);
  const g = { resolver, promise, pending: [], closer, closePromise };
  function addFn(v) {
    g.pending.push(v);
    if (g.pending.length === 1) g.resolver(true);
  }
  function closeFn() {
    g.closer(false);
  }
  async function* generatorFn() {
    let r = await Promise.race([g.promise, g.closePromise]);
    // if !r we still want to flush pending
    while (r || g.pending.length > 1) {
      // NB sensitive to ordering between yield and reset here!
      const pending = g.pending;
      g.pending = [];
      yield* pending;
      g.promise = new Promise(resolve => {
        g.resolver = resolve;
      });
      if (!r) break;
      r = await Promise.race([g.promise, g.closePromise]);
    }
  }
  return [addFn, closeFn, generatorFn()];
};

async function makeFileHandle() {
  // Set up local file storage
  const ts = new Date().getTime();
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
  return await fileHandle.createWritable();
}

async function makeZipper(){
  const writable = await makeFileHandle();
  // Set up zip stuff
  // TODO bundle
  const src = chrome.runtime.getURL('client-zip.js');
  const zzz = await import(src);
  const [ pusher, closer, generator ] = makeGenerator();
  const z = zzz.makeZip(generator).pipeTo(writable);
  return {
    push: pusher,
    close: async function(){
      closer();
      await z;
    }
  };
}

function addOverlay(overlayId){
  const d = document.createElement("div");
  d.style = "position: fixed; top: 0; right: 0; background-color: rgb(248 113 113);  padding: 1em; z-index: 1000";
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

function splitJobs(jobs) {
  // for split grids, take each image and give it its own "job"
  // TODO this modifies the midjourney metadata which then
  // shows up in the download. we might not want to do this?
  const splitJobs = [];
  jobs.forEach(j => {
    const isGrid = j.image_paths.length > 1;
    j.image_paths.forEach((image, index) => {
      const c = { ...j, image_paths: [ image ] };
      if (isGrid) c.split_index = index;
      splitJobs.push(c);
    });
  });
  return splitJobs;
}

function processJob({imageFormat, isDiffusion, isSplit, progressState}) {
  function setExtension(imageURL) {
    const rgx = /(\.[a-z]{3}[a-z]?)?$/i; // matches dot+3/4 chars if dot exists
    if (imageFormat === "webp") {
      return imageURL.replace(rgx, ".webp");
    }
    if (imageFormat === "png") {
      return imageURL.replace(rgx, ".png");
    }
    log(`Unknown image format '${imageType}' requested; going with default`);
    return imageURL;
  }
  function setDiffusion(imageURL){
    if (!isDiffusion || isSplit) return imageURL;
    const ext = "." + imageFormat;
    return imageURL.replace("0_0"+ext, "grid_0"+ext);
  }
  return async function*(iterator) {
    for await (const jobInfo of iterator) {
      if (progressState.cancelClicked) return;
      if (imageFormat === "jsonl") {
        yield { job: jobInfo };
        continue;
      }
      try {
      const imageURL = setDiffusion(setExtension(jobInfo.image_paths[0]));
      const imageData = await imageUrlToBase64(imageURL);
      const resp = await chrome.runtime.sendMessage({
        job: jobInfo, imageURL: imageURL, imageDataURL: imageData
      });
      log("embed", imageURL, resp.res);
      yield resp;
      } catch(e) {
        yield { error: e }
      }
    }
  }
}

async function addDownloadBar(overlayId){

  const dateRanges = await getArchiveDateRanges();
  if (!dateRanges || dateRanges.length <= 0) {
    return;
  }

  function textSpan(desc) {
    const d = document.createElement("div");
    d.innerText = desc;
    d.className = "text-slate-400 pr-2";
    return d;
  }
  function divE(...n) {
    const d = document.createElement("div");
    if (n.length <= 0) {
    } else if (n.length > 1) {
      d.append(...n);
    } else if (Array.isArray(n)) {
      d.append(...n);
    } else if (typeof n[0] === "string") {
      d.innerText = n;
    } else {
      d.appendChild(n[0]);
    }
    return d;
  }

  function dateObjToDateString(d){
    function pad(n) {
      return String(n).padStart(2, '0');
    }
    return `${d.y}-${pad(d.m)}-${pad(d.d)}`
  }
  const today = dateObjToDateString((() => {
    const d = new Date();
    return {
      y: d.getUTCFullYear(),
      m: d.getUTCMonth() + 1,
      d: d.getUTCDate()
    };
  })());
  const startDate = dateObjToDateString(dateRanges[0]);
  const endDate = dateObjToDateString(dateRanges[dateRanges.length-1]);

  const start = document.createElement("input");
  start.type = "date";
  start.name = "transfixDateRangeStart";
  start.value  = startDate;
  start.max = today;
  start.min = endDate;
  start.setAttribute("form",  overlayId+"_form");

  const end = document.createElement("input");
  end.type = "date";
  end.name = "transfixDateRangeEnd";
  end.value  = endDate;
  end.max = today;
  end.min = endDate;
  end.setAttribute("form", overlayId+"_form");

  const downloadButtonText = "Download Jobs";
  const buttonClasses = "text-slate-400 hover:text-slate-100 hover:underline";
  const downloadButton = document.createElement("button");
  downloadButton.innerText = downloadButtonText;
  downloadButton.className = "pr-2 mr-2 hover:underline";
  downloadButton.style = "border-right: 1px solid #11182f; white-space: pre";
  downloadButton.setAttribute("form", overlayId+"_form");

  const settingsButton = (() => {
    // <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
    //  <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
    // </svg>
    const svgNS = "http://www.w3.org/2000/svg";
    const s = document.createElementNS(svgNS, "svg");
    s.setAttribute("xmlns", svgNS);
    s.setAttribute("fill", "none");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("stroke-width",  "1.5");
    s.setAttribute("stroke","currentColor");
    s.setAttribute("class", "w-6 h-6 cursor-pointer");
    s.onclick = (() => {
      if (settingsPanel.style.display === "block") {
        settingsPanel.style.display = "none";
      } else {
        settingsPanel.style.display = "block";
      }
    });
    const p = document.createElementNS(svgNS, "path");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    p.setAttribute("d", "M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75");
    s.appendChild(p);
    return s;
  })();
  const [progress, setProgress] = (() => {
    const h1 = textSpan("To Process");
    h1.className = "text-center";
    const p1 = textSpan("Days");
    const p2 = textSpan("Jobs");
    const v1 = textSpan("");
    const v2 = textSpan("      ");
    v1.style = "white-space: pre";
    v2.style = "white-space: pre";
    const z1 = divE(v1, p1);
    z1.className = "flex justify-between";
    const z2 = divE(v2, p2);
    z2.className = "flex justify-between";
    const p3 = textSpan("Images");
    const v3 = textSpan("");
    const z3 = divE(v3, p3);
    z3.className = "flex justify-between hidden";
    const progress = divE(h1, z1, z2, z3);
    progress.className = "pr-4 mr-4 flex flex-col justify-center";
    progress.style = "border-right: 1px solid rgb(148, 163, 184)";
    const setProgress = (progressState) => {
      if (progressState && progressState.processedDays) {
        v1.innerText = `${progressState.processedDays} / ${progressState.totalDays} `;
        v2.innerText = `${progressState.processedJobs} / ${progressState.totalJobs}`;
        v3.innerText = `${progressState.processedImages} / ${progressState.totalImages}`;
        z3.classList.remove("hidden");
        h1.classList.add("hidden");
        return;
      }
      const [days, jobs] = dateRanges.reduce((acc, d) => {
        const day = dateObjToDateString(d);
        if (day <= start.value && day >= end.value) {
          const [dayAcc, jobAcc] = acc;
          return [dayAcc + 1, jobAcc + d.jobs];
        }
        return acc;
      }, [0, 0]);
      v1.innerText = days;
      v2.innerText = jobs;
    }
    return [progress, setProgress];
  })();


  const downloadButtonWrapper = (() => {
    const d = document.createElement("div");
    d.style = "border-radius: 9999px;";
    d.className = "flex bg-blue-900 px-3 p-2 items-center text-slate-100";
    d.appendChild(downloadButton);
    d.appendChild(settingsButton);
    return d;
  })();

  const progressState = {
    totalDays: 0,
    totalJobs: 0,
    totalImages: 0,
    processedDays: 0,
    processedJobs: 0,
    processedImages: 0,
    cancelClicked: false,
    isRunning: false,
  };

  const [cancelButton, setCancelButton] = (() => {
    const d = document.createElement("div");
    const b = document.createElement("button");
    b.innerText = "Cancel";
    b.className = buttonClasses;
    d.className = "pt-2 text-center";
    d.appendChild(b);
    const setCancelButton = (t) => {
      b.innerText = t;
    };
    b.onclick = () => {
      if (progressState.isRunning) {
        progressState.cancelClicked = true;
        setCancelButton("Cancelling...");
      } else removeOverlay(overlayId)();
    }
    return [d, setCancelButton];
  })();

  const buttons = divE(downloadButtonWrapper, cancelButton);

  const settingsPanel = (() => {
    function addRadio(value, name, text, checked) {
      const id = `${overlayId}_${value}`;
      const input = document.createElement("input");
      input.type = "radio";
      input.id = id;
      input.name = name;
      input.value = value;
      input.className = "px-2";
      if (checked) input.setAttribute("checked", "checked");
      const label = document.createElement("label");
      label.innerText = text;
      label.setAttribute("for", id);
      label.className = "px-2";
      return [input, label];
    }
    // png / webp / json
    const imgFormatName = "imgFormat";
    const imgFormatDesc = textSpan("Image Format");
    imgFormatDesc.innerText = "Image Format";
    const [ pngInput, pngText] = addRadio("png", imgFormatName, "PNG");
    const [ webpInput, webpText] = addRadio("webp", imgFormatName, "WebP", true);
    const [ jsonlInput, jsonlText] = addRadio("jsonl", imgFormatName, "JSONL");
    const imgFormatInputs = divE(webpInput, webpText, pngInput, pngText, jsonlInput, jsonlText);

    // upscales / grids / both / splits
    const jobTypeName = "jobType";
    const jobTypeDesc = textSpan("Job Type");
    const [ gridInput, gridLabel ] = addRadio("grid", jobTypeName, "Grid");
    const [ upscaleInput, upscaleLabel] = addRadio("upscale", jobTypeName, "Upscale", true);
    const [ bothInput, bothLabel ] = addRadio("both", jobTypeName, "Both");
    const [ splitInput, splitLabel ] = addRadio("split", jobTypeName, "Split Grid");

    const jobTypeInputs = divE(upscaleInput, upscaleLabel, gridInput, gridLabel, bothInput, bothLabel, splitInput, splitLabel);

    const f = document.createElement("form");
    f.id = overlayId+"_form";
    f.className = "grid gap-2";
    f.style = "grid-template-columns: auto auto";
    f.append(imgFormatDesc, imgFormatInputs, jobTypeDesc, jobTypeInputs);
    f.onsubmit = (ev) => {
      (async () => {
        const formData = new FormData(ev.target);
        const jobType = formData.get(jobTypeName);
        const imageFormat = formData.get(imgFormatName);
        const startDay = formData.get("transfixDateRangeStart");
        const endDay = formData.get("transfixDateRangeEnd");
        const days = [];
        dateRanges.forEach(d => {
          const day = dateObjToDateString(d);
          if (day <= startDay && day >= endDay) {
            days.push(d);
          }
        });
        if (days.length <= 0) {
          const padSides = ((str, target) => {
            const diff = target.length - str.length;
            if (diff <= 0) return;
            const eachSide = diff / 2;
            const padOne = diff % 2;
            const s = str.padStart(str.length + diff, " ");
            return s.padEnd(s.length + diff + padOne, " ");
          });
          downloadButton.innerText = padSides("No Jobs", downloadButtonText);
          setTimeout(() => {
            downloadButton.innerText = downloadButtonText;
          }, 2500);
          return;
        }
        progressState.totalDays = days.length;
        for (const [name, value] of formData) {
          log(name, ":", value);
        }

        const isSplit = jobType === "split";
        const isUpscale = jobType === "upscale" || jobType === "both";
        const isDiffusion = jobType === "grid" || jobType === "both" || isSplit;
        const isBoth = jobType === "both";
        function jobIsUpscale(j) { return isUpscale && j.type.includes("upsample") }
        function jobIsDiffusion(j) { return isDiffusion && (j.type.includes("diffusion") || j.type.includes("outpaint")) }
        async function* gen() {
          let pendingJobs = [];
          for (const d of days) {
            if (progressState.cancelClicked) return;
            const dayJobs = await getJobsByDay(d);
            const filteredDayJobs = dayJobs.filter(j => isBoth || jobIsUpscale(j) || jobIsDiffusion(j));
            progressState.processedDays += 1;
            progressState.totalJobs += filteredDayJobs.length;
            setProgress(progressState);
            pendingJobs = pendingJobs.concat(filteredDayJobs);
            // TODO check against existing jobs, avoid fetching info
            const maxJobs = 50;
            while (pendingJobs.length >= maxJobs) {
              if (progressState.cancelClicked) return;
              const jobsToCheck = pendingJobs.splice(0, maxJobs);
              const j = [... await getJobsFromList(jobsToCheck.map(j => j.id))];
              const expandedJobs = isSplit ? splitJobs(j) : j;
              progressState.processedJobs += j.length;
              progressState.totalImages += expandedJobs.length;
              setProgress(progressState);
              if (progressState.cancelClicked) return;
              yield* expandedJobs;
            }
          }
          // fetch remainder
          if (pendingJobs.length <= 0 || progressState.cancelClicked) return;
          const j = [... await getJobsFromList(pendingJobs.map(j => j.id))];
          const expandedJobs = isSplit ? splitJobs(j) : j;
          progressState.processedJobs += j.length;
          progressState.totalImages += expandedJobs.length;
          setProgress(progressState);
          if (progressState.cancelClicked) return;
          yield* expandedJobs;
        }
        const jobIter = gen();
        const pj = processJob({imageFormat, isDiffusion, isSplit, progressState});
        const processors = new Array(3).fill(jobIter).map(pj);

        const zipper = await makeZipper();

        const jsonlData = [];
        const errorData = [];

        // update UI a bit
        downloadButtonWrapper.classList.remove("bg-blue-900");
        downloadButtonWrapper.classList.remove("text-slate-100");
        downloadButtonWrapper.style.color = "rgb(8 11 22)"; // bg-darkBlue-900
        downloadButtonWrapper.style.backgroundColor = "rgb(253 224 71)"; // bg-yellow-300
        downloadButtonWrapper.innerText = 'Downloading...';
        setCancelButton("Cancel Download");
        progressState.isRunning = true;

        await Promise.all(processors.map(async (z) => {
          for await (const res of z) {
            if (res.error) {
              errorData.push(new Date().toString() + " " + res.error + "\n");
              log("Got error: ", res.error);
              progressState.processedImages += 1;
              setProgress(progressState);
              continue;
            }
            jsonlData.push(JSON.stringify(res.job));
            if (imageFormat === "jsonl") {
              // skip if expecting only json
              progressState.processedImages += 1;
              setProgress(progressState);
              continue;
            }
            const name = res.filename;
            const lastModified = new Date(res.mtime + " UTC");
            const input = await (await fetch(res.enrichedImage)).arrayBuffer();
            zipper.push({ name, lastModified, input })
            progressState.processedImages += 1;
            setProgress(progressState);
          }
        }));


        // Update UI to reflect completing state
        downloadButtonWrapper.innerText = progressState.cancelClicked ? 'Cancelling...' : 'Completing...';

        // Collect jsonl and error lines, push to zip and close
        zipper.push({name: "metadata.jsonl", input: jsonlData.join("\n") });
        if (errorData.length > 0) zipper.push({name: "error.log", input: errorData.join("\n") });
        await zipper.close();

        // Update UI to reflect completed state
        downloadButtonWrapper.style.color = "";
        downloadButtonWrapper.classList.add("text-slate-100");
        downloadButtonWrapper.style.backgroundColor = "";
        downloadButtonWrapper.classList.add("bg-blue-900");
        downloadButtonWrapper.transition = "background 1s ease-out";
        downloadButtonWrapper.innerText = progressState.cancelClicked ? "Download Canceled" : "Download Complete";
        setCancelButton("Close");
        progressState.isRunning = false;

      })();
      return false;
    }


    const d = document.createElement("div");
    d.appendChild(f);
    d.className = "hidden bg-darkBlue-900 text-slate-100 w-fit m-auto p-4";
    return d;
  })();

  function dateInput(dateElem, desc){
    dateElem.onchange = setProgress;
    dateElem.style.cursor = "pointer";
    const d = divE(textSpan(desc), dateElem);
    d.className = "flex justify-between";
    return d;
  }
  const inputs = (() => {
    const d = divE(dateInput(start, "From "), dateInput(end, "To "));
    d.className = "pr-4 mr-4 flex flex-col justify-center";
    d.style = "border-right: 1px solid  rgb(148, 163, 184)";
    return d;
  })();


  const d = divE(inputs, progress, buttons);
  d.style = "border-radius:999px;";
  d.className = "bg-white text-white p-4 px-8 w-full flex flex-row justify-evenly items-stertch";
  setTimeout(() => {
    d.classList.remove("bg-white");
    d.classList.add("bg-darkBlue-900");
    d.style.transition = "background 1s ease-out";
    setProgress();
  }, 100);

  const outer = document.createElement("div");
  outer.className = "fixed z-30 bottom-4"
  outer.style = "margin-left: 5rem;"
  outer.appendChild(settingsPanel);
  outer.appendChild(d);
  outer.id = overlayId;

  const e = document.getElementById("app-root").querySelector('div[data-name="Inner container"]');
  e.appendChild(outer);
}

// NB this is executed in page content context
(async function() {

  // get the archive page but not a job drill-down from archive
  // with a ?jobId query param
  if (document.location.pathname.endsWith("/archive/") &&
      !document.location.search.includes("jobId")) {
    addDownloadBar("transfixDownloadBar"+(new Date().getTime()));
    return;
  }

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
  const jobStatusRequest = getJobsFromList(jobsThatNeedAStatus());

  const overlayId = "transfixProgressOverlay" + new Date().getTime();
  addOverlay(overlayId);
  const zipper = await makeZipper();

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
      const name = response.filename;
      const lastModified = new Date(response.mtime + " UTC");
      const input = await (await fetch(response.enrichedImage)).arrayBuffer();
      zipper.push({ name, lastModified, input });
      jobCounter++;
      updateOverlay(overlayId, `Processed ${jobCounter} / ${imagesToDownload.length} images`);
    }
  }

  const concurrency = 3;
  const iterator = imagesToDownload.values();
  const workers = new Array(concurrency).fill(iterator).map(processImage);
  const start = new Date();
  await Promise.all(workers);
  await zipper.close();
  const end = new Date();

  log("Elapsed=", end - start, "concurrency=", concurrency);
  updateOverlay(overlayId, "All images downloaded");
  setTimeout(removeOverlay(overlayId), 5000);

})();
