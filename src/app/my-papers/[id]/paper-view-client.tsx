"use client";

import {
  Document,
  Page,
  Image as PdfImage,
  pdf,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer/lib/react-pdf.browser";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { WatermarkedImage } from "@/components/watermarked-image";
import { createClient } from "@/lib/supabase/client";

type Question = {
  id: number;
  marks: number;
  difficulty: number;
  calculator: boolean;
  createdAt: string;
  images: {
    id: number;
    storage_path: string;
    position: number;
    signedUrl: string | null;
  }[];
  answerImages: {
    id: number;
    storage_path: string;
    position: number;
    signedUrl: string | null;
  }[];
};

type Paper = {
  id: number;
  title: string;
  question_bank: string;
  show_answers: boolean;
  one_question_per_page: boolean | null;
  created_at: string;
  updated_at: string;
  questions: Question[];
};

type PaperViewClientProps = {
  paper: Paper;
};

type PdfImageSource = {
  key: string;
  url: string | null;
  bucket: "question_images" | "answer_images";
  path: string;
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image blob."));
    reader.readAsDataURL(blob);
  });

const isPdfSupportedImage = (blob: Blob, path: string) => {
  const type = blob.type.toLowerCase();
  if (type === "image/png" || type === "image/jpeg" || type === "image/jpg") {
    return true;
  }
  const ext = path.split(".").pop()?.toLowerCase();
  return ext === "png" || ext === "jpg" || ext === "jpeg";
};

const blobToPdfDataUrl = async (blob: Blob, path: string) => {
  if (!isPdfSupportedImage(blob, path)) {
    throw new Error(`Unsupported image format for PDF: ${path}`);
  }
  return blobToDataUrl(blob);
};

const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingBottom: 44,
    paddingHorizontal: 44,
    fontSize: 11,
    color: "#111827",
  },
  header: {
    position: "absolute",
    top: 16,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 10,
  },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 10,
  },
  footerRight: {
    alignItems: "flex-end",
  },
  footerLine: {
    textAlign: "right",
  },
  coverTitle: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 8,
  },
  coverMeta: {
    fontSize: 11,
    color: "#4b5563",
    marginBottom: 4,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: "#d1d5db",
    marginTop: 12,
    marginBottom: 18,
  },
  questionBlock: {
    marginBottom: 18,
  },
  questionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 6,
  },
  questionTitle: {
    fontSize: 12,
    fontWeight: 600,
  },
  questionMeta: {
    fontSize: 11,
    fontWeight: 400,
  },
  calculatorTag: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#111827",
  },
  imageWrapper: {
    position: "relative",
    marginBottom: 8,
  },
  image: {
    width: "100%",
  },
  pageWatermark: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  pageWatermarkImage: {
    width: "50%",
    opacity: 0.06,
  },
  pageWatermarkText: {
    fontSize: 48,
    color: "#111827",
    opacity: 0.06,
  },
  answerSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  answerTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: "#15803d",
    marginBottom: 6,
  },
  endOfPaper: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    textAlign: "center",
    color: "#6b7280",
    fontSize: 10,
  },
});

function PdfHeader() {
  return (
    <View style={pdfStyles.header} fixed>
      <Text>©MyWay Academy</Text>
      <Text render={({ pageNumber }) => `Page ${pageNumber}`} />
    </View>
  );
}

function PdfFooter() {
  return (
    <View style={pdfStyles.footer} fixed>
      <Text>©MyWay Academy</Text>
      <View style={pdfStyles.footerRight}>
        <Text
          style={pdfStyles.footerLine}
          render={({ pageNumber }) => `Page ${pageNumber}`}
        />
        <Text
          style={pdfStyles.footerLine}
          render={({ pageNumber, totalPages }) =>
            pageNumber < totalPages ? "Turn Over" : ""
          }
        />
      </View>
    </View>
  );
}

function PdfPageWatermark({
  watermarkSrc,
  watermarkText = "MyQuestionBank",
}: {
  watermarkSrc: string | null;
  watermarkText?: string;
}) {
  return (
    <View style={pdfStyles.pageWatermark} fixed>
      {watermarkSrc ? (
        <PdfImage style={pdfStyles.pageWatermarkImage} src={watermarkSrc} />
      ) : (
        <Text style={pdfStyles.pageWatermarkText}>{watermarkText}</Text>
      )}
    </View>
  );
}

function PaperPdfDocument({
  paper,
  imageData,
  watermarkSrc,
  oneQuestionPerPage = false,
}: {
  paper: Paper;
  imageData: Record<string, string>;
  watermarkSrc: string | null;
  oneQuestionPerPage?: boolean;
}) {
  const totalMarks = paper.questions.reduce((sum, q) => sum + q.marks, 0);
  const formattedDate = new Date(paper.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const renderQuestionContent = (question: Question, index: number) => (
    <View key={question.id} style={pdfStyles.questionBlock}>
      <View style={pdfStyles.questionHeader}>
        <Text style={pdfStyles.questionTitle}>
          {index + 1}.{" "}
          <Text style={pdfStyles.questionMeta}>
            [Maximum mark: {question.marks}]
          </Text>
        </Text>
        {!question.calculator ? (
          <Text style={pdfStyles.calculatorTag}>[No calculator]</Text>
        ) : null}
      </View>
      {question.images.map((image) => (
        <View key={image.id} style={pdfStyles.imageWrapper}>
          <PdfImage
            style={pdfStyles.image}
            src={
              imageData[image.storage_path] ??
              image.signedUrl ??
              image.storage_path
            }
          />
        </View>
      ))}
      {paper.show_answers && question.answerImages.length > 0 ? (
        <View style={pdfStyles.answerSection}>
          <Text style={pdfStyles.answerTitle}>Answer:</Text>
          {question.answerImages.map((image) => (
            <View key={image.id} style={pdfStyles.imageWrapper}>
              <PdfImage
                style={pdfStyles.image}
                src={
                  imageData[image.storage_path] ??
                  image.signedUrl ??
                  image.storage_path
                }
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader />
        <PdfFooter />
        <View>
          <Text style={pdfStyles.coverTitle}>{paper.title}</Text>
          <Text style={pdfStyles.coverMeta}>
            Total Questions: {paper.questions.length}
          </Text>
          <Text style={pdfStyles.coverMeta}>Total Marks: {totalMarks}</Text>
          <Text style={pdfStyles.coverMeta}>Created: {formattedDate}</Text>
          <View style={pdfStyles.sectionDivider} />
        </View>
        <PdfPageWatermark watermarkSrc={watermarkSrc} />
      </Page>
      {oneQuestionPerPage ? (
        <>
          {paper.questions.map((question, index) => (
            <Page key={question.id} size="A4" style={pdfStyles.page}>
              <PdfHeader />
              <PdfFooter />
              {renderQuestionContent(question, index)}
              <PdfPageWatermark watermarkSrc={watermarkSrc} />
            </Page>
          ))}
          <Page size="A4" style={pdfStyles.page}>
            <PdfHeader />
            <PdfFooter />
            <Text style={pdfStyles.endOfPaper}>End of Paper</Text>
            <PdfPageWatermark watermarkSrc={watermarkSrc} />
          </Page>
        </>
      ) : (
        <Page size="A4" style={pdfStyles.page} wrap>
          <PdfHeader />
          <PdfFooter />
          {paper.questions.map((question, index) =>
            renderQuestionContent(question, index),
          )}
          <Text style={pdfStyles.endOfPaper}>End of Paper</Text>
          <PdfPageWatermark watermarkSrc={watermarkSrc} />
        </Page>
      )}
    </Document>
  );
}

export function PaperViewClient({ paper }: PaperViewClientProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const pdfFileName = `paper-${paper.id}.pdf`;
  const oneQuestionPerPage = paper.one_question_per_page ?? false;
  const [pdfImagesReady, setPdfImagesReady] = useState(false);
  const [pdfImages, setPdfImages] = useState<Record<string, string>>({});
  const [pdfImagesError, setPdfImagesError] = useState<string | null>(null);
  const [pdfIsGenerating, setPdfIsGenerating] = useState(false);
  const [pdfWatermark, setPdfWatermark] = useState<string | null>(null);
  const [pdfWatermarkReady, setPdfWatermarkReady] = useState(false);
  const [pdfWatermarkError, setPdfWatermarkError] = useState<string | null>(
    null,
  );

  const pdfImageSources = useMemo(() => {
    const sources: PdfImageSource[] = [];
    const seen = new Set<string>();
    const addSource = (
      image: Question["images"][number] | Question["answerImages"][number],
      bucket: PdfImageSource["bucket"],
    ) => {
      if (!image.storage_path || seen.has(image.storage_path)) return;
      seen.add(image.storage_path);
      sources.push({
        key: image.storage_path,
        url: image.signedUrl,
        bucket,
        path: image.storage_path,
      });
    };

    paper.questions.forEach((question) => {
      question.images.forEach((image) => {
        addSource(image, "question_images");
      });
      question.answerImages.forEach((image) => {
        addSource(image, "answer_images");
      });
    });

    return sources;
  }, [paper]);

  useEffect(() => {
    let cancelled = false;

    const loadImages = async () => {
      if (pdfImageSources.length === 0) {
        setPdfImagesReady(true);
        setPdfImages({});
        return;
      }

      setPdfImagesReady(false);
      setPdfImagesError(null);

      const results = await Promise.allSettled(
        pdfImageSources.map(async (source) => {
          if (source.url) {
            try {
              const response = await fetch(source.url);
              if (response.ok) {
                const blob = await response.blob();
                return {
                  key: source.key,
                  dataUrl: await blobToPdfDataUrl(blob, source.path),
                };
              }
            } catch {
              // Fall back to authenticated download when signed URL fetch fails.
            }
          }

          const { data, error } = await supabase.storage
            .from(source.bucket)
            .download(source.path);
          if (error || !data) {
            throw new Error(error?.message ?? "Failed to download image.");
          }
          return {
            key: source.key,
            dataUrl: await blobToPdfDataUrl(data, source.path),
          };
        }),
      );

      if (cancelled) return;

      const next: Record<string, string> = {};
      let failed = 0;

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          next[result.value.key] = result.value.dataUrl;
        } else {
          failed += 1;
        }
      });

      setPdfImages(next);
      setPdfImagesReady(true);
      if (failed > 0) {
        setPdfImagesError(
          `Failed to load ${failed}/${pdfImageSources.length} images for the PDF. Only PNG/JPG images are supported.`,
        );
      }
    };

    void loadImages();

    return () => {
      cancelled = true;
    };
  }, [pdfImageSources, supabase]);

  useEffect(() => {
    let cancelled = false;

    const loadWatermark = async () => {
      setPdfWatermarkReady(false);
      setPdfWatermarkError(null);

      try {
        const response = await fetch("/logo.jpg");
        if (!response.ok) {
          throw new Error("Failed to load watermark.");
        }
        const blob = await response.blob();
        const dataUrl = await blobToDataUrl(blob);
        if (!cancelled) {
          setPdfWatermark(dataUrl);
        }
      } catch (_error) {
        if (!cancelled) {
          setPdfWatermark(null);
          setPdfWatermarkError(
            "Failed to load watermark for the PDF. Please retry.",
          );
        }
      } finally {
        if (!cancelled) {
          setPdfWatermarkReady(true);
        }
      }
    };

    void loadWatermark();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this paper?")) {
      return;
    }

    try {
      const response = await fetch(`/api/papers/${paper.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete paper");
      }

      router.push("/my-papers");
    } catch (error) {
      alert("Failed to delete paper. Please try again.");
      console.error(error);
    }
  };

  const pdfReady = pdfImagesReady && pdfWatermarkReady && !!pdfWatermark;

  const handleDownloadPdf = async () => {
    if (!pdfReady || pdfIsGenerating) return;

    setPdfIsGenerating(true);
    try {
      const blob = await pdf(
        <PaperPdfDocument
          paper={paper}
          imageData={pdfImages}
          watermarkSrc={pdfWatermark}
          oneQuestionPerPage={oneQuestionPerPage}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = pdfFileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      alert("Failed to generate PDF. Please try again.");
      console.error(error);
    } finally {
      setPdfIsGenerating(false);
    }
  };

  return (
    <div>
      <div className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <button
                type="button"
                onClick={() => router.back()}
                className="text-blue-600 hover:text-blue-800"
              >
                ← Back
              </button>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
                  disabled={!pdfReady || pdfIsGenerating}
                >
                  {!pdfImagesReady
                    ? "Loading images..."
                    : !pdfWatermarkReady
                      ? "Loading watermark..."
                      : pdfIsGenerating
                        ? "Preparing PDF..."
                        : "Download PDF"}
                </button>
              </div>
            </div>
          </div>
          {pdfImagesError || pdfWatermarkError ? (
            <div className="mt-2 space-y-1 text-xs text-amber-600">
              {pdfImagesError ? <p>{pdfImagesError}</p> : null}
              {pdfWatermarkError ? <p>{pdfWatermarkError}</p> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 max-w-4xl">
        {/* Cover Page */}
        <div className="cover-page flex min-h-[60vh] flex-col justify-center">
          <div className="mb-8 pb-6 border-b-2 border-gray-300">
            <h1 className="text-3xl font-bold mb-2">{paper.title}</h1>
            <div className="text-sm text-gray-600 space-y-1">
              <p>Total Questions: {paper.questions.length}</p>
              <p>
                Total Marks:{" "}
                {paper.questions.reduce((sum, q) => sum + q.marks, 0)}
              </p>
              <p>
                Created:{" "}
                {new Date(paper.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Questions Section */}
        <div className="space-y-8">
          {paper.questions.map((question, index) => (
            <div key={question.id} className="page-break-inside-avoid">
              {/* Question Header */}
              <div className="mb-4">
                <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-baseline gap-2">
                  <span>
                    <h2 className="text-lg font-semibold col-start-1 -ml-5">
                      {index + 1}.{" "}
                      <span className="font-normal">
                        [Maximum mark: {question.marks}]
                      </span>
                    </h2>
                  </span>
                  {!question.calculator ? (
                    <span className="col-start-3 font-bold uppercase tracking-wide justify-self-end">
                      [No calculator]
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Question Images */}
              {question.images.length > 0 && (
                <div className="space-y-3 mb-6">
                  {question.images.map((image) => (
                    <div key={image.id}>
                      {image.signedUrl && (
                        <WatermarkedImage
                          src={image.signedUrl}
                          alt={`Question ${index + 1} part ${image.position}`}
                          className="max-w-full h-auto border border-gray-200 rounded"
                          watermarkSrc="/logo.jpg"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Answer Section (if show_answers is true) */}
              {paper.show_answers && question.answerImages.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-md font-semibold mb-3 text-green-700">
                    Answer:
                  </h3>
                  <div className="space-y-3">
                    {question.answerImages.map((image) => (
                      <div key={image.id}>
                        {image.signedUrl && (
                          <WatermarkedImage
                            src={image.signedUrl}
                            alt={`Answer ${index + 1} part ${image.position}`}
                            className="max-w-full h-auto border border-gray-200 rounded"
                            watermarkSrc="/logo.jpg"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-gray-200 text-center text-sm text-gray-500">
          <p>End of Paper</p>
        </div>
      </div>
    </div>
  );
}
