// pdfjs-dist needs a worker URL.
// Vite can serve it via import.meta.url.
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export default pdfjsLib;
