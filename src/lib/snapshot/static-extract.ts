import { readFile } from "node:fs/promises";
import path from "node:path";

export interface StaticDocument {
  title: string;
  content: string;
  docType: string;
  sportId?: string | null;
  metadata: Record<string, unknown>;
}

export interface FitRubricLevel {
  min: number;
  max: number;
  range: string;
  rating: string;
  description: string;
  quote: string;
  bullets: string[];
}

export interface ClutchRubricLevel {
  range: string;
  rating: string;
  description: string;
}

export async function extractStaticDocuments(sourceRoot: string): Promise<StaticDocument[]> {
  const [
    validationText,
    methodologyText,
    landingText,
    testDriveText,
    fitRubricText,
    clutchGuideText
  ] = await Promise.all([
    readFile(path.join(sourceRoot, "components/ValidationBar.tsx"), "utf8"),
    readFile(path.join(sourceRoot, "components/MethodologyView.tsx"), "utf8"),
    readFile(path.join(sourceRoot, "components/LandingPage.tsx"), "utf8"),
    readFile(path.join(sourceRoot, "components/TestDriveModal.tsx"), "utf8"),
    readFile(path.join(sourceRoot, "components/FitScoreRubric.tsx"), "utf8"),
    readFile(path.join(sourceRoot, "components/ClutchFactorGuide.tsx"), "utf8")
  ]);

  const docs: StaticDocument[] = [];

  for (const claim of extractValidationClaims(validationText)) {
    docs.push({
      title: claim.title,
      content: claim.content,
      docType: "validation_claim",
      metadata: { sourceFile: "components/ValidationBar.tsx" }
    });
  }

  for (const link of extractTestDriveLinks(testDriveText)) {
    docs.push({
      title: `${link.sportLabel} ${link.testType} Link`,
      content: `${link.sportLabel} ${link.testType} assessment link: ${link.url}`,
      docType: "test_drive_link",
      sportId: link.sportId,
      metadata: { url: link.url, sourceFile: "components/TestDriveModal.tsx" }
    });
  }

  for (const level of extractFitRubricLevels(fitRubricText)) {
    docs.push({
      title: `Crew Chief Alignment Rubric: ${level.rating}`,
      content: `${level.range}\n${level.description}\n${level.quote}\n${level.bullets.join("\n")}`,
      docType: "fit_rubric",
      metadata: { sourceFile: "components/FitScoreRubric.tsx", min: level.min, max: level.max }
    });
  }

  for (const level of extractClutchRubricLevels(clutchGuideText)) {
    docs.push({
      title: `Clutch Factor Rubric: ${level.rating}`,
      content: `${level.range}\n${level.description}`,
      docType: "clutch_rubric",
      metadata: { sourceFile: "components/ClutchFactorGuide.tsx" }
    });
  }

  for (const textDoc of extractTextNodeDocuments(methodologyText, "Methodology View", "methodology_copy", "components/MethodologyView.tsx")) {
    docs.push(textDoc);
  }

  for (const textDoc of extractTextNodeDocuments(landingText, "Landing Page", "landing_copy", "components/LandingPage.tsx")) {
    docs.push(textDoc);
  }

  return docs;
}

function extractValidationClaims(text: string) {
  const matches = [...text.matchAll(/target=\{([^}]+)\}[\s\S]*?label="([^"]+)"/g)];

  return matches.map((match, index) => ({
    title: `Validation Claim ${index + 1}`,
    content: `${match[2]} Value: ${match[1]}.`
  }));
}

function extractTestDriveLinks(text: string) {
  const sportLabels = new Map<string, string>();
  for (const match of text.matchAll(/\{ id: '([^']+)', label: '([^']+)' \}/g)) {
    sportLabels.set(match[1], match[2]);
  }

  const links: Array<{ sportId: string; sportLabel: string; testType: string; url: string }> = [];
  for (const match of text.matchAll(/(\w+): \{\s+clutch: '([^']+)',\s+nterpret: '([^']+)'/g)) {
    const sportId = match[1];
    const sportLabel = sportLabels.get(sportId) ?? sportId;
    links.push({ sportId, sportLabel, testType: "Clutch Factor", url: match[2] });
    links.push({ sportId, sportLabel, testType: "NTerpret", url: match[3] });
  }

  return links;
}

function extractFitRubricLevels(text: string): FitRubricLevel[] {
  const levels: FitRubricLevel[] = [];

  for (const match of text.matchAll(/\{\s+min:\s*([\d.]+),[\s\S]*?max:\s*([\d.]+),[\s\S]*?range:\s*"([^"]+)",[\s\S]*?rating:\s*"([^"]+)",[\s\S]*?desc:\s*"([^"]+)",[\s\S]*?quote:\s*"([^"]+)",[\s\S]*?bullets:\s*\[([\s\S]*?)\]\s+\}/g)) {
    const bullets = [...match[7].matchAll(/"([^"]+)"/g)].map((bulletMatch) => bulletMatch[1]);
    levels.push({
      min: Number(match[1]),
      max: Number(match[2]),
      range: match[3],
      rating: match[4],
      description: match[5],
      quote: match[6],
      bullets
    });
  }

  return levels;
}

function extractClutchRubricLevels(text: string): ClutchRubricLevel[] {
  return [...text.matchAll(/\['([^']+)', '([^']+)', '[^']+', '([^']+)'\]/g)].map((match) => ({
    range: match[1],
    rating: match[2],
    description: match[3]
  }));
}

function extractTextNodeDocuments(
  text: string,
  titlePrefix: string,
  docType: string,
  sourceFile: string
): StaticDocument[] {
  const textNodes = [...text.matchAll(/>([^<>{]{24,})</g)]
    .map((match) => match[1].replace(/\s+/g, " ").trim())
    .filter((value) => /[A-Za-z]{3}/.test(value))
    .filter((value) => !value.startsWith("bg-"))
    .filter((value) => !value.startsWith("text-"))
    .filter((value) => !value.startsWith("border-"))
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 24);

  return textNodes.map((content, index) => ({
    title: `${titlePrefix} Text ${index + 1}`,
    content,
    docType,
    metadata: { sourceFile }
  }));
}
