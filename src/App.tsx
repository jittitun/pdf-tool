"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  ChevronLeft,
  FileCheck2,
  Files,
  GripVertical,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Merge,
  Minimize2,
  MousePointer2,
  RotateCcw,
  RotateCw,
  Scissors,
  ShieldCheck,
  Sparkles,
  Stamp,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { PDFDocument, degrees } from "pdf-lib";
import JSZip from "jszip";

type ToolId = "split" | "merge" | "combine" | "reorder" | "extract" | "rotate" | "watermark" | "compress";
type SourceFile = { id: string; file: File; bytes: Uint8Array; pageCount: number };
type PageItem = {
  id: string;
  sourceId: string;
  sourceName: string;
  pageIndex: number;
  thumbnail: string;
  rotation: number;
};

type PdfJsViewport = { width: number; height: number };
type PdfJsPage = {
  getViewport: (options: { scale: number }) => PdfJsViewport;
  render: (options: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfJsViewport;
  }) => { promise: Promise<void> };
};
type PdfJsDocument = { getPage: (pageNumber: number) => Promise<PdfJsPage> };
type PdfJsApi = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: { data: Uint8Array }) => {
    promise: Promise<PdfJsDocument>;
    destroy: () => Promise<void>;
  };
};

declare global {
  interface Window {
    pdfjsLib?: PdfJsApi;
    __PDF_WORKER_SOURCE__?: string;
  }
}

let pdfJsPromise: Promise<PdfJsApi> | null = null;
let embeddedWorkerUrl: string | null = null;

function getPdfWorkerUrl() {
  if (window.__PDF_WORKER_SOURCE__) {
    embeddedWorkerUrl ??= URL.createObjectURL(new Blob([window.__PDF_WORKER_SOURCE__], { type: "text/javascript" }));
    return embeddedWorkerUrl;
  }
  return `${import.meta.env.BASE_URL}vendor/pdfjs/pdf.worker.min.js`;
}

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfJsPromise) return pdfJsPromise;
  pdfJsPromise = new Promise<PdfJsApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${import.meta.env.BASE_URL}vendor/pdfjs/pdf.min.js`;
    script.async = true;
    script.onload = () => window.pdfjsLib
      ? resolve(window.pdfjsLib)
      : reject(new Error("ไม่สามารถเริ่มระบบแสดง PDF ได้"));
    script.onerror = () => reject(new Error("ไม่สามารถโหลดระบบแสดง PDF ได้"));
    document.head.appendChild(script);
  });
  return pdfJsPromise;
}

const tools: Array<{
  id: ToolId;
  title: string;
  description: string;
  icon: typeof Scissors;
  accent: string;
}> = [
  { id: "split", title: "แยก PDF", description: "แบ่งเอกสารเป็นหลายไฟล์ตามช่วงหน้า", icon: Scissors, accent: "violet" },
  { id: "merge", title: "รวม PDF", description: "นำ PDF หลายไฟล์มาต่อกันตามลำดับ", icon: Merge, accent: "blue" },
  { id: "combine", title: "เลือกหน้ามารวม", description: "หยิบหน้าจากหลายไฟล์มาสร้างเอกสารใหม่", icon: Layers3, accent: "teal" },
  { id: "reorder", title: "จัดเรียงหน้า", description: "ลากสลับ หมุน หรือลบหน้าเอกสาร", icon: GripVertical, accent: "orange" },
  { id: "extract", title: "ดึงหน้าที่ต้องการ", description: "เลือกเฉพาะหน้าแล้วส่งออกเป็น PDF ใหม่", icon: MousePointer2, accent: "pink" },
  { id: "rotate", title: "หมุนหน้าที่เลือก", description: "หมุนเฉพาะหน้าหรือช่วงหน้าที่กำหนด", icon: RotateCw, accent: "violet" },
  { id: "watermark", title: "ใส่ลายน้ำ", description: "เพิ่มลายน้ำภาษาไทยลงในหน้าที่ต้องการ", icon: Stamp, accent: "blue" },
  { id: "compress", title: "บีบอัด PDF", description: "ลดขนาดไฟล์สแกนสำหรับส่งต่อและจัดเก็บ", icon: Minimize2, accent: "teal" },
];

const toolCopy: Record<ToolId, { heading: string; body: string; multiple: boolean }> = {
  split: { heading: "แยก PDF", body: "อัปโหลด PDF 1 ไฟล์ แล้วกำหนดช่วงหน้าที่ต้องการแยก", multiple: false },
  merge: { heading: "รวม PDF", body: "เพิ่ม PDF หลายไฟล์ แล้วลากเพื่อจัดลำดับก่อนรวม", multiple: true },
  combine: { heading: "เลือกหน้ามารวม", body: "เพิ่มหลายไฟล์ เลือกหน้า และจัดลำดับเป็นเอกสารใหม่", multiple: true },
  reorder: { heading: "จัดเรียงหน้า PDF", body: "ลากหน้าเพื่อสลับลำดับ หมุน หรือลบหน้าที่ไม่ต้องการ", multiple: false },
  extract: { heading: "ดึงหน้าที่ต้องการ", body: "คลิกเลือกหน้าที่ต้องการ แล้วส่งออกเป็น PDF ใหม่", multiple: false },
  rotate: { heading: "หมุนหน้าที่เลือก", body: "ระบุหน้าหรือช่วงหน้า แล้วเลือกองศาที่ต้องการหมุน", multiple: false },
  watermark: { heading: "ใส่ลายน้ำ", body: "เพิ่มข้อความลายน้ำภาษาไทยหรืออังกฤษลงในหน้าที่กำหนด", multiple: false },
  compress: { heading: "บีบอัด PDF", body: "ลดขนาด PDF โดยแปลงแต่ละหน้าเป็นภาพ JPEG", multiple: false },
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function safeName(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]/g, "-");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function makeThumbnail(bytes: Uint8Array, pageNumber: number) {
  const pdfjs = await loadPdfJs();
  pdfjs.GlobalWorkerOptions.workerSrc = getPdfWorkerUrl();
  const copy = bytes.slice();
  const loadingTask = pdfjs.getDocument({ data: copy });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber);
  const natural = page.getViewport({ scale: 1 });
  const scale = Math.min(0.34, 180 / natural.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("ไม่สามารถสร้างภาพตัวอย่างได้");
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  const result = canvas.toDataURL("image/jpeg", 0.76);
  await loadingTask.destroy();
  return result;
}

function parseRanges(value: string, max: number): number[][] {
  const groups = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (!groups.length) throw new Error("กรุณาระบุช่วงหน้า เช่น 1-3, 4-6");
  return groups.map((group) => {
    const match = group.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error(`รูปแบบช่วงหน้าไม่ถูกต้อง: ${group}`);
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > max) throw new Error(`ช่วงหน้า ${group} อยู่นอกเอกสาร`);
    return Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
  });
}

function parsePageSet(value: string, max: number) {
  return new Set(parseRanges(value, max).flat());
}

function createWatermark(text: string, color: string) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("ไม่สามารถสร้างลายน้ำได้");
  context.font = '700 72px "Noto Sans Thai", Tahoma, sans-serif';
  const width = Math.ceil(context.measureText(text).width + 48);
  canvas.width = Math.max(120, width);
  canvas.height = 120;
  const next = canvas.getContext("2d")!;
  next.font = '700 72px "Noto Sans Thai", Tahoma, sans-serif';
  next.fillStyle = color;
  next.textAlign = "center";
  next.textBaseline = "middle";
  next.fillText(text, canvas.width / 2, canvas.height / 2);
  return canvas.toDataURL("image/png");
}

export default function Home() {
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rangeText, setRangeText] = useState("1");
  const [outputName, setOutputName] = useState("เอกสารใหม่");
  const [watermarkText, setWatermarkText] = useState("สำเนา");
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.22);
  const [watermarkAngle, setWatermarkAngle] = useState(-35);
  const [watermarkColor, setWatermarkColor] = useState("#d94b3d");
  const [compressionQuality, setCompressionQuality] = useState(0.68);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [dragPage, setDragPage] = useState<string | null>(null);
  const [dragFile, setDragFile] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const resetWorkspace = useCallback(() => {
    setFiles([]);
    setPages([]);
    setSelected(new Set());
    setRangeText("1");
    setOutputName("เอกสารใหม่");
    setError("");
    setProgress(0);
  }, []);

  const openTool = (id: ToolId) => {
    resetWorkspace();
    setActiveTool(id);
  };

  const closeTool = () => {
    resetWorkspace();
    setActiveTool(null);
  };

  useEffect(() => {
    return () => pages.forEach((page) => page.thumbnail.startsWith("blob:") && URL.revokeObjectURL(page.thumbnail));
  }, [pages]);

  const addFiles = async (incoming: FileList | File[]) => {
    if (!activeTool || busy) return;
    setBusy(true);
    setError("");
    setProgress(3);
    try {
      const pdfs = Array.from(incoming).filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
      if (!pdfs.length) throw new Error("กรุณาเลือกไฟล์ PDF เท่านั้น");
      const accepted = toolCopy[activeTool].multiple ? pdfs : pdfs.slice(0, 1);
      const newFiles: SourceFile[] = [];
      const newPages: PageItem[] = [];
      let completed = 0;

      for (const file of accepted) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let doc: PDFDocument;
        try {
          doc = await PDFDocument.load(bytes);
        } catch {
          throw new Error(`เปิด “${file.name}” ไม่สำเร็จ ไฟล์อาจเสียหรือมีรหัสผ่าน`);
        }
        const sourceId = crypto.randomUUID();
        const source = { id: sourceId, file, bytes, pageCount: doc.getPageCount() };
        newFiles.push(source);
        for (let i = 0; i < source.pageCount; i++) {
          const thumbnail = await makeThumbnail(bytes, i + 1);
          newPages.push({
            id: crypto.randomUUID(), sourceId, sourceName: file.name,
            pageIndex: i, thumbnail, rotation: 0,
          });
          completed += 1;
          setProgress(Math.min(92, 8 + Math.round((completed / Math.max(1, accepted.length * source.pageCount)) * 84)));
        }
      }

      setFiles((current) => toolCopy[activeTool].multiple ? [...current, ...newFiles] : newFiles);
      setPages((current) => toolCopy[activeTool].multiple ? [...current, ...newPages] : newPages);
      if (!files.length && newFiles[0]) setOutputName(`${safeName(newFiles[0].file.name)}-แก้ไขแล้ว`);
      if (activeTool === "extract") setSelected(new Set());
      setRangeText(newFiles[0] ? `1-${newFiles[0].pageCount}` : "1");
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการอ่าน PDF");
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 600);
    }
  };

  const removeFile = (id: string) => {
    setFiles((current) => current.filter((file) => file.id !== id));
    setPages((current) => current.filter((page) => page.sourceId !== id));
  };

  const moveFile = (targetId: string) => {
    if (!dragFile || dragFile === targetId) return;
    setFiles((current) => {
      const next = [...current];
      const from = next.findIndex((file) => file.id === dragFile);
      const to = next.findIndex((file) => file.id === targetId);
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setDragFile(null);
  };

  const movePage = (targetId: string) => {
    if (!dragPage || dragPage === targetId) return;
    setPages((current) => {
      const next = [...current];
      const from = next.findIndex((page) => page.id === dragPage);
      const to = next.findIndex((page) => page.id === targetId);
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setDragPage(null);
  };

  const togglePage = (id: string) => {
    if (activeTool !== "extract" && activeTool !== "combine" && activeTool !== "rotate") return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rotatePage = (id: string, direction = 90) => {
    setPages((current) => current.map((page) => page.id === id ? { ...page, rotation: (page.rotation + direction + 360) % 360 } : page));
  };

  const removePage = (id: string) => {
    setPages((current) => current.filter((page) => page.id !== id));
    setSelected((current) => { const next = new Set(current); next.delete(id); return next; });
  };

  const buildFromPages = async (items: PageItem[]) => {
    const output = await PDFDocument.create();
    const loaded = new Map<string, PDFDocument>();
    for (const item of items) {
      let source = loaded.get(item.sourceId);
      if (!source) {
        const file = files.find((entry) => entry.id === item.sourceId);
        if (!file) continue;
        source = await PDFDocument.load(file.bytes);
        loaded.set(item.sourceId, source);
      }
      const [copied] = await output.copyPages(source, [item.pageIndex]);
      if (item.rotation) copied.setRotation(degrees((copied.getRotation().angle + item.rotation) % 360));
      output.addPage(copied);
    }
    return output.save();
  };

  const processPdf = async () => {
    if (!activeTool || !files.length) return;
    setBusy(true);
    setError("");
    setProgress(12);
    try {
      const name = `${safeName(outputName || "เอกสารใหม่")}.pdf`;
      if (activeTool === "split") {
        const ranges = parseRanges(rangeText, files[0].pageCount);
        const source = await PDFDocument.load(files[0].bytes);
        const zip = new JSZip();
        for (let i = 0; i < ranges.length; i++) {
          const doc = await PDFDocument.create();
          const copied = await doc.copyPages(source, ranges[i]);
          copied.forEach((page) => doc.addPage(page));
          zip.file(`${safeName(outputName)}-${i + 1}.pdf`, await doc.save());
          setProgress(20 + Math.round(((i + 1) / ranges.length) * 65));
        }
        downloadBlob(await zip.generateAsync({ type: "blob" }), `${safeName(outputName)}-แยกไฟล์.zip`);
      } else if (activeTool === "merge") {
        const ordered = files.flatMap((file) => pages.filter((page) => page.sourceId === file.id));
        const bytes = await buildFromPages(ordered);
        downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), name);
      } else if (activeTool === "rotate") {
        const bytes = await buildFromPages(pages);
        downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), name);
      } else if (activeTool === "watermark") {
        if (!watermarkText.trim()) throw new Error("กรุณาระบุข้อความลายน้ำ");
        const source = await PDFDocument.load(files[0].bytes);
        const targets = parsePageSet(rangeText, source.getPageCount());
        const image = await source.embedPng(createWatermark(watermarkText.trim(), watermarkColor));
        source.getPages().forEach((page, index) => {
          if (!targets.has(index)) return;
          const { width, height } = page.getSize();
          const scale = Math.min((width * 0.62) / image.width, 1.2);
          const imageWidth = image.width * scale;
          const imageHeight = image.height * scale;
          page.drawImage(image, {
            x: (width - imageWidth) / 2,
            y: (height - imageHeight) / 2,
            width: imageWidth,
            height: imageHeight,
            opacity: watermarkOpacity,
            rotate: degrees(watermarkAngle),
          });
        });
        const bytes = await source.save({ useObjectStreams: true });
        downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), name);
      } else if (activeTool === "compress") {
        const pdfjs = await loadPdfJs();
        pdfjs.GlobalWorkerOptions.workerSrc = getPdfWorkerUrl();
        const task = pdfjs.getDocument({ data: files[0].bytes.slice() });
        const rendered = await task.promise;
        const source = await PDFDocument.load(files[0].bytes);
        const output = await PDFDocument.create();
        for (let index = 0; index < source.getPageCount(); index++) {
          const sourcePage = source.getPage(index);
          const { width, height } = sourcePage.getSize();
          const pdfPage = await rendered.getPage(index + 1);
          const viewport = pdfPage.getViewport({ scale: 1.35 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("ไม่สามารถบีบอัดหน้าเอกสารได้");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
          const jpg = await output.embedJpg(canvas.toDataURL("image/jpeg", compressionQuality));
          const page = output.addPage([width, height]);
          page.drawImage(jpg, { x: 0, y: 0, width, height });
          setProgress(15 + Math.round(((index + 1) / source.getPageCount()) * 75));
        }
        await task.destroy();
        const bytes = await output.save({ useObjectStreams: true });
        downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), name);
      } else {
        const chosen = activeTool === "extract" || activeTool === "combine"
          ? pages.filter((page) => selected.has(page.id))
          : pages;
        if (!chosen.length) throw new Error("กรุณาเลือกอย่างน้อย 1 หน้า");
        const bytes = await buildFromPages(chosen);
        downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), name);
      }
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ไม่สามารถสร้างไฟล์ผลลัพธ์ได้");
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 800);
    }
  };

  const canDownload = useMemo(() => {
    if (!files.length || busy) return false;
    if (activeTool === "extract" || activeTool === "combine") return selected.size > 0;
    return true;
  }, [activeTool, busy, files.length, selected.size]);

  const watermarkPreviewPages = useMemo(() => {
    if (activeTool !== "watermark" || !files[0]) return new Set<number>();
    try {
      return parsePageSet(rangeText, files[0].pageCount);
    } catch {
      return new Set<number>();
    }
  }, [activeTool, files, rangeText]);

  if (activeTool) {
    const copy = toolCopy[activeTool];
    return (
      <main className="app-shell workspace-shell">
        <header className="topbar compact">
          <button className="brand-button" onClick={closeTool} aria-label="กลับหน้าหลัก">
            <span className="brand-mark"><img src={`${import.meta.env.BASE_URL}cat-logo.png`} alt="" /></span>
            <span><b>SAO Toolkit by MSN</b><small>ปลอดภัยใน Browser</small></span>
          </button>
          <div className="privacy-chip"><ShieldCheck size={16} /> ไม่มีการอัปโหลดไฟล์</div>
          <button className="icon-button mobile-only" onClick={closeTool}><X size={20} /></button>
        </header>

        <section className="workspace">
          <div className="workspace-heading">
            <button className="back-button" onClick={closeTool}><ChevronLeft size={18} /> เครื่องมือทั้งหมด</button>
            <div className="workspace-title-row">
              <div><span className={`tool-symbol ${activeTool}`}>
                {(() => { const Icon = tools.find((tool) => tool.id === activeTool)!.icon; return <Icon size={23} />; })()}
              </span></div>
              <div><h1>{copy.heading}</h1><p>{copy.body}</p></div>
            </div>
          </div>

          {!files.length ? (
            <div
              className={`drop-zone ${busy ? "busy" : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}
              onClick={() => !busy && inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple={copy.multiple} hidden onChange={(event) => event.target.files && addFiles(event.target.files)} />
              <div className="upload-illustration"><UploadCloud size={34} /></div>
              <h2>{busy ? "กำลังอ่านเอกสาร…" : "วางไฟล์ PDF ที่นี่"}</h2>
              <p>หรือลากไฟล์จากเครื่องมาวาง</p>
              <button className="primary-button" type="button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Files size={18} />} เลือกไฟล์ PDF</button>
              <div className="drop-note"><LockKeyhole size={14} /> ไฟล์อยู่ในเครื่องของคุณตลอดเวลา</div>
              {progress > 0 && <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>}
            </div>
          ) : (
            <div className="editor-layout">
              <section className="editor-main">
                {activeTool === "merge" ? (
                  <div className="file-list-panel">
                    <div className="panel-heading"><div><h2>ลำดับไฟล์</h2><p>ลากเพื่อเรียงลำดับก่อนรวม</p></div><span>{files.reduce((sum, file) => sum + file.pageCount, 0)} หน้า</span></div>
                    <div className="file-list">
                      {files.map((source, index) => (
                        <article key={source.id} draggable onDragStart={() => setDragFile(source.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => moveFile(source.id)}>
                          <GripVertical size={19} className="drag-handle" />
                          <span className="file-order">{index + 1}</span>
                          <div className="mini-preview"><img src={pages.find((page) => page.sourceId === source.id)?.thumbnail} alt="" /></div>
                          <div className="file-meta"><b>{source.file.name}</b><span>{source.pageCount} หน้า · {formatBytes(source.file.size)}</span></div>
                          <button onClick={() => removeFile(source.id)} aria-label="ลบไฟล์"><Trash2 size={18} /></button>
                        </article>
                      ))}
                    </div>
                    <button className="add-file-button" onClick={() => inputRef.current?.click()}><UploadCloud size={18} /> เพิ่มไฟล์ PDF</button>
                    <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(event) => event.target.files && addFiles(event.target.files)} />
                  </div>
                ) : (
                  <div className="page-panel">
                    <div className="panel-heading">
                      <div><h2>ภาพตัวอย่างเอกสาร</h2><p>{activeTool === "rotate" ? "คลิกเลือกหน้า แล้วกดหมุนซ้ายหรือขวาบนหน้านั้น" : activeTool === "watermark" ? "ปรับลายน้ำทางด้านขวา แล้วตรวจผลบนแต่ละหน้าก่อนดาวน์โหลด" : activeTool === "extract" || activeTool === "combine" ? "คลิกเพื่อเลือกหน้า จากนั้นลากเพื่อจัดลำดับ" : "ลากเพื่อเรียงหน้า ใช้ปุ่มบนการ์ดเพื่อหมุนหรือลบ"}</p></div>
                      <span>{pages.length} หน้า</span>
                    </div>
                    {activeTool === "combine" && <button className="add-file-button inline" onClick={() => inputRef.current?.click()}><UploadCloud size={17} /> เพิ่ม PDF อีกไฟล์</button>}
                    {activeTool === "combine" && <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(event) => event.target.files && addFiles(event.target.files)} />}
                    <div className="page-grid">
                      {pages.map((page, index) => (
                        <article
                          className={`page-card ${selected.has(page.id) ? "selected" : ""}`}
                          key={page.id} draggable
                          onDragStart={() => setDragPage(page.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => movePage(page.id)}
                          onClick={() => togglePage(page.id)}
                        >
                          <div className="page-image-wrap">
                            <img src={page.thumbnail} alt={`หน้า ${page.pageIndex + 1}`} style={{ transform: `rotate(${page.rotation}deg)` }} />
                            {activeTool === "watermark" && watermarkPreviewPages.has(page.pageIndex) && watermarkText.trim() && <span className="watermark-preview" style={{ color: watermarkColor, opacity: watermarkOpacity, transform: `translate(-50%, -50%) rotate(${watermarkAngle}deg)` }}>{watermarkText}</span>}
                            {(activeTool === "extract" || activeTool === "combine" || activeTool === "rotate") && <span className="select-check">{selected.has(page.id) && <Check size={15} strokeWidth={3} />}</span>}
                            {(activeTool === "reorder" || activeTool === "combine" || (activeTool === "rotate" && selected.has(page.id))) && <div className={`page-actions ${activeTool === "rotate" ? "always-visible" : ""}`}>
                              {activeTool === "rotate" && <button onClick={(e) => { e.stopPropagation(); rotatePage(page.id, -90); }} aria-label="หมุนซ้าย"><RotateCcw size={15} /></button>}
                              <button onClick={(e) => { e.stopPropagation(); rotatePage(page.id); }} aria-label="หมุนขวา"><RotateCw size={15} /></button>
                              {activeTool !== "rotate" && <button onClick={(e) => { e.stopPropagation(); removePage(page.id); }} aria-label="ลบหน้า"><Trash2 size={15} /></button>}
                            </div>}
                          </div>
                          <div className="page-label"><GripVertical size={15} /><span>หน้า {page.pageIndex + 1}</span><small>{activeTool === "combine" ? safeName(page.sourceName).slice(0, 14) : `ลำดับ ${index + 1}`}</small></div>
                        </article>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <aside className="export-panel">
                <div className="export-title"><Sparkles size={18} /><h2>ตั้งค่าผลลัพธ์</h2></div>
                {activeTool === "split" && <label className="field-label">ช่วงหน้าที่ต้องการแยก<input value={rangeText} onChange={(e) => setRangeText(e.target.value)} placeholder="เช่น 1-3, 4-6, 7" /><small>คั่นแต่ละไฟล์ด้วยเครื่องหมายจุลภาค</small></label>}
                {activeTool === "rotate" && <div className="selection-summary"><span>หน้าที่เลือก</span><b>{selected.size} หน้า</b><button onClick={() => setSelected(new Set(pages.map((page) => page.id)))}>เลือกทั้งหมด</button></div>}
                {activeTool === "watermark" && <><label className="field-label">ข้อความลายน้ำ<input value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} maxLength={80} /></label><label className="field-label">หน้าที่ใส่ลายน้ำ<input value={rangeText} onChange={(e) => setRangeText(e.target.value)} placeholder="เช่น 1-5" /></label><div className="option-grid"><label className="field-label">ความโปร่งใส<input type="range" min="0.08" max="0.7" step="0.02" value={watermarkOpacity} onChange={(e) => setWatermarkOpacity(Number(e.target.value))} /><small>{Math.round(watermarkOpacity * 100)}%</small></label><label className="field-label">มุม<input type="number" min="-90" max="90" value={watermarkAngle} onChange={(e) => setWatermarkAngle(Number(e.target.value))} /></label></div><label className="field-label color-field">สีลายน้ำ<input type="color" value={watermarkColor} onChange={(e) => setWatermarkColor(e.target.value)} /></label></>}
                {activeTool === "compress" && <><label className="field-label">คุณภาพภาพ<input type="range" min="0.35" max="0.9" step="0.05" value={compressionQuality} onChange={(e) => setCompressionQuality(Number(e.target.value))} /><small>{Math.round(compressionQuality * 100)}% · ค่าน้อยลง ไฟล์จะเล็กลง</small></label><div className="tool-note">เหมาะกับ PDF สแกน เอกสารผลลัพธ์จะเป็นภาพและไม่สามารถค้นหาหรือเลือกข้อความได้</div></>}
                {(activeTool === "extract" || activeTool === "combine") && <div className="selection-summary"><span>หน้าที่เลือก</span><b>{selected.size} หน้า</b><button onClick={() => setSelected(new Set(pages.map((page) => page.id)))}>เลือกทั้งหมด</button></div>}
                <label className="field-label">ชื่อไฟล์ผลลัพธ์<div className="filename-input"><input value={outputName} onChange={(e) => setOutputName(e.target.value)} /><span>.pdf</span></div></label>
                <div className="result-summary">
                  <div><FileCheck2 size={17} /><span>ไฟล์ต้นฉบับ</span><b>{files.length}</b></div>
                  <div><Layers3 size={17} /><span>จำนวนหน้า</span><b>{activeTool === "extract" || activeTool === "combine" ? selected.size : pages.length}</b></div>
                </div>
                {error && <div className="error-box">{error}</div>}
                {progress > 0 && <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>}
                <button className="download-button" onClick={processPdf} disabled={!canDownload}>
                  {busy ? <LoaderCircle className="spin" size={19} /> : <ArrowDownToLine size={19} />}
                  {busy ? "กำลังประมวลผล…" : activeTool === "split" ? "แยกและดาวน์โหลด ZIP" : "สร้างและดาวน์โหลด PDF"}
                </button>
                <div className="local-promise"><ShieldCheck size={18} /><div><b>ประมวลผลภายใน Browser</b><span>เอกสารจะไม่ถูกส่งออกจากอุปกรณ์</span></div></div>
                <button className="reset-button" onClick={resetWorkspace}>เริ่มงานใหม่</button>
              </aside>
            </div>
          )}
          {error && !files.length && <div className="standalone-error">{error}<button onClick={() => setError("")}><X size={15} /></button></div>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell home-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><img src={`${import.meta.env.BASE_URL}cat-logo.png`} alt="โลโก้แมว SAO Toolkit" /></span><span><b>SAO Toolkit by MSN</b><small>Private PDF Tools</small></span></div>
        <nav><a href="#tools">เครื่องมือ</a><a href="#privacy">ความเป็นส่วนตัว</a><a href="#how">วิธีใช้งาน</a></nav>
        <div className="status-pill"><span /> พร้อมใช้งานบนเครื่องคุณ</div>
        <button className="icon-button mobile-only"><Menu size={20} /></button>
      </header>

      <section className="hero">
        <div className="hero-cat"><img src={`${import.meta.env.BASE_URL}cat-logo.png`} alt="แมวประจำ SAO Toolkit" /></div>
        <div className="eyebrow"><ShieldCheck size={16} /> PRIVATE BY DESIGN · ไม่อัปโหลดไฟล์</div>
        <h1>จัดการ PDF ได้ง่าย<br /><span>ปลอดภัยใน Browser</span></h1>
        <p>แยก รวม เลือก และจัดเรียงหน้า PDF โดยไฟล์ไม่ออกจากเครื่องของคุณ<br className="desktop-break" /> เหมาะสำหรับเอกสารสำคัญและงานที่ต้องการความเป็นส่วนตัว</p>
        <div className="hero-trust"><span><Check size={16} /> ไม่ต้องสมัครสมาชิก</span><span><Check size={16} /> รองรับภาษาไทย</span><span><Check size={16} /> ใช้งานฟรี</span></div>
        {!window.__PDF_WORKER_SOURCE__ && <a className="offline-download" href={`${import.meta.env.BASE_URL}downloads/SAO-Toolkit-by-MSN-Offline.html`} download><ArrowDownToLine size={18} /> ดาวน์โหลดเวอร์ชัน Offline</a>}
      </section>

      <section className="tools-section" id="tools">
        <div className="section-heading"><div><span>เลือกเครื่องมือ</span><h2>วันนี้คุณต้องการทำอะไรกับ PDF?</h2></div><p>ทุกอย่างเกิดขึ้นภายใน Browser ของคุณ</p></div>
        <div className="tool-grid">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return <button key={tool.id} className={`tool-card ${tool.accent}`} onClick={() => openTool(tool.id)}>
              <span className="tool-icon"><Icon size={25} /></span>
              <span className="tool-copy"><b>{tool.title}</b><small>{tool.description}</small></span>
              <span className="tool-arrow">→</span>
            </button>;
          })}
        </div>
      </section>

      <section className="privacy-banner" id="privacy">
        <div className="privacy-shield"><LockKeyhole size={27} /></div>
        <div><span>ความเป็นส่วนตัวที่ตรวจสอบได้</span><h2>ไฟล์ของคุณ ไม่เคยออกจากเครื่อง</h2><p>การอ่าน แสดงตัวอย่าง และสร้าง PDF ใหม่เกิดขึ้นใน Browser ไม่มีการส่งเอกสารไปเก็บหรือประมวลผลบน Server</p></div>
        <div className="privacy-facts"><div><b>100%</b><span>ประมวลผลในเครื่อง</span></div><div><b>0</b><span>ไฟล์ที่อัปโหลด</span></div></div>
      </section>

      <section className="how-section" id="how">
        <span className="section-kicker">ใช้งานง่ายใน 3 ขั้นตอน</span>
        <div className="steps">
          <div><b>1</b><span><strong>เลือกเครื่องมือ</strong><small>เลือกงานที่ต้องการทำกับ PDF</small></span></div>
          <div><b>2</b><span><strong>จัดการเอกสาร</strong><small>ลากไฟล์ เลือกหน้า หรือจัดลำดับ</small></span></div>
          <div><b>3</b><span><strong>ดาวน์โหลดผลลัพธ์</strong><small>รับไฟล์ใหม่กลับลงเครื่องทันที</small></span></div>
        </div>
      </section>
      <footer><div className="brand mini"><span className="brand-mark"><img src={`${import.meta.env.BASE_URL}cat-logo.png`} alt="" /></span><span><b>SAO Toolkit by MSN</b></span></div><p>สร้างเพื่อความสะดวกและความเป็นส่วนตัวของเอกสาร</p><span>ไฟล์อยู่กับคุณเสมอ <ShieldCheck size={15} /></span></footer>
    </main>
  );
}
