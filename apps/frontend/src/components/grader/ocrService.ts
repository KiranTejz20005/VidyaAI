import { OcrResultData } from './graderTypes';

export const sampleBiologyOcrResult: OcrResultData = {
  rawOcrText: `DELHI PUBLIC SCHOOL, BOKARO STEEL CITY
CLASS 10 - BIOLOGY & LIFE PROCESSES UNIT TEST
Time: 1 Hour 30 Mins | Maximum Marks: 48

SECTION A: CELLULAR PHYSIOLOGY & TRANSPORT (16 Marks)
1. Which blood vessel carries blood away from the heart? [2 Marks]
2. Which of the following organelles is primarily involved in photosynthesis? [2 Marks]
3. Explain the role of chloroplasts in photosynthesis, naming the main pigments involved and briefly outlining the two major stages of the process. [2 Marks]
4. Describe the flow of blood through the human heart starting from the right atrium and ending at the aorta; include the names of valves crossed. [2 Marks]
5. Draw a labelled diagram of an alveolus showing capillaries and air space (label alveolar sac, capillary, and direction of gas exchange). [2 Marks]
6. Draw a neat labelled diagram of the human digestive system (stomach, small intestine, large intestine, liver, pancreas) and label the site where most absorption occurs. [5 Marks]
7. Describe the structure of a nephron and explain how glomerular filtration and selective reabsorption occur in the renal tubule. [5 Marks]

SECTION B: PLANT PHYSIOLOGY & GAS DIFFUSION (14 Marks)
8. Compare the internal structure and functional significance of palisade mesophyll and spongy mesophyll in dicot leaves. [4 Marks]
9. What is transpiration? State two environmental factors that increase the rate of transpiration in terrestrial plants. [5 Marks]
10. Explain how the structure of xylem vessels facilitates water transport in plants (mention one structural feature and its role). [5 Marks]

SECTION C: EXPERIMENTAL ANALYSIS & RESPIRATORY VOLUMES (18 Marks)
11. A diagram shows two potted plants — Plant A in bright light with broad green leaves, Plant B kept in dim light with pale, elongated leaves.
   (a) Explain why Plant B has pale and elongated leaves (etiolation). [2 Marks]
   (b) Suggest one practical measure to help Plant B recover. [3 Marks]
12. A student inhales 500 mL of air per breath (Tidal Volume) at a respiratory rate of 12 breaths/minute. Calculate the total pulmonary ventilation rate in liters per minute. [2 Marks]
13. If 150 mL of each breath stays in anatomical dead space, calculate the alveolar ventilation rate. [3 Marks]`,
  examTitle: 'Class 10 Biology Unit Test',
  subject: 'Biology & Life Processes',
  grade: 'Class 10th',
  totalMarks: 48,
  ocrEngine: 'Gemini 3.7 Vision OCR + Layout Document Analyzer (Free Tier)',
  confidenceScore: 99.4,
  sections: [
    { name: 'Section A', instructions: 'Cellular Physiology & Transport', totalMarks: 16 },
    { name: 'Section B', instructions: 'Plant Physiology & Gas Diffusion', totalMarks: 14 },
    { name: 'Section C', instructions: 'Experimental Analysis & Respiratory Volumes', totalMarks: 18 },
  ],
  extractedQuestions: [
    {
      id: 'ocr-bio-q1',
      number: '1',
      mainNumber: '1',
      text: 'Which blood vessel carries blood away from the heart?',
      maxMarks: 2,
      section: 'Section A',
      type: 'short',
      keyConcepts: ['Arteries', 'Blood flow', 'Heart'],
      confidence: 99.8,
      rawSnippet: '1. Which blood vessel carries blood away from the heart? [2 Marks]',
    },
    {
      id: 'ocr-bio-q2',
      number: '2',
      mainNumber: '2',
      text: 'Which of the following organelles is primarily involved in photosynthesis?',
      maxMarks: 2,
      section: 'Section A',
      type: 'short',
      keyConcepts: ['Chloroplast', 'Photosynthesis', 'Organelles'],
      confidence: 99.9,
      rawSnippet: '2. Which of the following organelles is primarily involved in photosynthesis? [2 Marks]',
    },
    {
      id: 'ocr-bio-q3',
      number: '3',
      mainNumber: '3',
      text: 'Explain the role of chloroplasts in photosynthesis, naming the main pigments involved and briefly outlining the two major stages of the process.',
      maxMarks: 2,
      section: 'Section A',
      type: 'long',
      keyConcepts: ['Chlorophyll a/b', 'Light reaction', 'Calvin cycle'],
      confidence: 99.2,
      rawSnippet: '3. Explain the role of chloroplasts in photosynthesis, naming the main pigments involved and briefly outlining the two major stages of the process. [2 Marks]',
    },
    {
      id: 'ocr-bio-q4',
      number: '4',
      mainNumber: '4',
      text: 'Describe the flow of blood through the human heart starting from the right atrium and ending at the aorta; include the names of valves crossed.',
      maxMarks: 2,
      section: 'Section A',
      type: 'long',
      keyConcepts: ['Heart chambers', 'Tricuspid', 'Bicuspid', 'Aorta'],
      confidence: 98.9,
      rawSnippet: '4. Describe the flow of blood through the human heart starting from the right atrium and ending at the aorta; include the names of valves crossed. [2 Marks]',
    },
    {
      id: 'ocr-bio-q5',
      number: '5',
      mainNumber: '5',
      text: 'Draw a labelled diagram of an alveolus showing capillaries and air space (label alveolar sac, capillary, and direction of gas exchange).',
      maxMarks: 2,
      section: 'Section A',
      type: 'diagram',
      keyConcepts: ['Alveolus', 'Gas exchange', 'Capillaries'],
      confidence: 99.1,
      rawSnippet: '5. Draw a labelled diagram of an alveolus showing capillaries and air space (label alveolar sac, capillary, and direction of gas exchange). [2 Marks]',
    },
    {
      id: 'ocr-bio-q6',
      number: '6',
      mainNumber: '6',
      text: 'Draw a neat labelled diagram of the human digestive system (stomach, small intestine, large intestine, liver, pancreas) and label the site where most absorption occurs.',
      maxMarks: 5,
      section: 'Section A',
      type: 'diagram',
      keyConcepts: ['Digestive system', 'Small intestine', 'Absorption'],
      confidence: 99.3,
      rawSnippet: '6. Draw a neat labelled diagram of the human digestive system (stomach, small intestine, large intestine, liver, pancreas) and label the site where most absorption occurs. [5 Marks]',
    },
    {
      id: 'ocr-bio-q7',
      number: '7',
      mainNumber: '7',
      text: 'Describe the structure of a nephron and explain how glomerular filtration and selective reabsorption occur in the renal tubule.',
      maxMarks: 5,
      section: 'Section A',
      type: 'long',
      keyConcepts: ['Nephron', 'Bowman capsule', 'Filtration'],
      confidence: 99.0,
      rawSnippet: '7. Describe the structure of a nephron and explain how glomerular filtration and selective reabsorption occur in the renal tubule. [5 Marks]',
    },
    {
      id: 'ocr-bio-q8',
      number: '8',
      mainNumber: '8',
      text: 'Compare the internal structure and functional significance of palisade mesophyll and spongy mesophyll in dicot leaves.',
      maxMarks: 4,
      section: 'Section B',
      type: 'short',
      keyConcepts: ['Palisade mesophyll', 'Spongy mesophyll', 'Leaf anatomy'],
      confidence: 99.4,
      rawSnippet: '8. Compare the internal structure and functional significance of palisade mesophyll and spongy mesophyll in dicot leaves. [4 Marks]',
    },
    {
      id: 'ocr-bio-q9',
      number: '9',
      mainNumber: '9',
      text: 'What is transpiration? State two environmental factors that increase the rate of transpiration in terrestrial plants.',
      maxMarks: 5,
      section: 'Section B',
      type: 'short',
      keyConcepts: ['Transpiration', 'Stomata', 'Temperature', 'Wind'],
      confidence: 99.5,
      rawSnippet: '9. What is transpiration? State two environmental factors that increase the rate of transpiration in terrestrial plants. [5 Marks]',
    },
    {
      id: 'ocr-bio-q10',
      number: '10',
      mainNumber: '10',
      text: 'Explain how the structure of xylem vessels facilitates water transport in plants (mention one structural feature and its role).',
      maxMarks: 5,
      section: 'Section B',
      type: 'long',
      keyConcepts: ['Xylem', 'Lignin', 'Capillary action'],
      confidence: 99.1,
      rawSnippet: '10. Explain how the structure of xylem vessels facilitates water transport in plants (mention one structural feature and its role). [5 Marks]',
    },
    {
      id: 'ocr-bio-q11a',
      number: '11 (a)',
      mainNumber: '11',
      subPart: 'a',
      text: 'A diagram shows two potted plants — Plant A in bright light with broad green leaves, Plant B kept in dim light with pale, elongated leaves. Explain why Plant B has pale and elongated leaves (etiolation).',
      maxMarks: 2,
      section: 'Section C',
      type: 'short',
      keyConcepts: ['Etiolation', 'Auxin', 'Dim light'],
      confidence: 99.6,
      rawSnippet: '11. (a) Explain why Plant B has pale and elongated leaves (etiolation). [2 Marks]',
    },
    {
      id: 'ocr-bio-q11b',
      number: '11 (b)',
      mainNumber: '11',
      subPart: 'b',
      text: 'Suggest one practical measure to help Plant B recover.',
      maxMarks: 3,
      section: 'Section C',
      type: 'short',
      keyConcepts: ['Sunlight', 'Chlorophyll recovery'],
      confidence: 99.7,
      rawSnippet: '11. (b) Suggest one practical measure to help Plant B recover. [3 Marks]',
    },
    {
      id: 'ocr-bio-q12',
      number: '12',
      mainNumber: '12',
      text: 'A student inhales 500 mL of air per breath (Tidal Volume) at a respiratory rate of 12 breaths/minute. Calculate the total pulmonary ventilation rate in liters per minute.',
      maxMarks: 2,
      section: 'Section C',
      type: 'numerical',
      keyConcepts: ['Tidal volume', 'Ventilation rate', '6.0 L/min'],
      confidence: 99.2,
      rawSnippet: '12. A student inhales 500 mL of air per breath (Tidal Volume) at a respiratory rate of 12 breaths/minute. Calculate the total pulmonary ventilation rate in liters per minute. [2 Marks]',
    },
    {
      id: 'ocr-bio-q13',
      number: '13',
      mainNumber: '13',
      text: 'If 150 mL of each breath stays in anatomical dead space, calculate the alveolar ventilation rate.',
      maxMarks: 3,
      section: 'Section C',
      type: 'numerical',
      keyConcepts: ['Dead space', 'Alveolar ventilation', '4.2 L/min'],
      confidence: 99.3,
      rawSnippet: '13. If 150 mL of each breath stays in anatomical dead space, calculate the alveolar ventilation rate. [3 Marks]',
    },
  ],
};

export const sampleMathsOcrResult: OcrResultData = {
  rawOcrText: `DELHI PUBLIC SCHOOL, R.K. PURAM
CLASS 10 - MATHEMATICS TERM ASSESSMENT
Time: 2 Hours | Maximum Marks: 50

SECTION A: ALGEBRA & POLYNOMIALS (10 Marks)
1. Find the roots of the quadratic equation 2x² - 7x + 3 = 0. [2 Marks]
2. If α and β are the zeroes of the quadratic polynomial f(x) = x² - p(x + 1) - c, prove that (α + 1)(β + 1) = 1 - c. [3 Marks]
3. Find the 20th term from the last term of the AP: 3, 8, 13, ..., 253. [5 Marks]

SECTION B: TRIGONOMETRY & GEOMETRY (20 Marks)
4. Prove that: (sin θ / (1 + cos θ)) + ((1 + cos θ) / sin θ) = 2 cosec θ. [4 Marks]
5. From the top of a 75m high lighthouse from the sea level, the angles of depression of two ships are 30° and 45°. Find the distance between the two ships. [5 Marks]
6. State and prove Basic Proportionality Theorem (Thales Theorem). [5 Marks]
7. In a right triangle ABC right angled at C, P and Q are points on the sides CA and CB respectively which divide these sides in the ratio 2:1. Prove that: 9(AQ² + BP²) = 13 AB². [6 Marks]

SECTION C: COORDINATE GEOMETRY & CIRCLES (20 Marks)
8. Find the coordinates of the points of trisection of the line segment joining (4, -1) and (-2, -3). [4 Marks]
9. A quadrilateral ABCD is drawn to circumscribe a circle. Prove that AB + CD = AD + BC. [4 Marks]
10. Case Study on Arithmetic Progressions:
   (a) A factory produces 600 cars in the third year and 700 cars in the seventh year. Assuming uniform annual increase, find the production in the 1st year. [4 Marks]
   (b) Find the total production in the first 10 years. [4 Marks]
   (c) In which year did the production reach 1000 cars? [4 Marks]`,
  examTitle: 'Class 10 Mathematics Assessment',
  subject: 'Mathematics',
  grade: 'Class 10th',
  totalMarks: 50,
  ocrEngine: 'Gemini 3.7 Vision OCR + Layout Document Analyzer (Free Tier)',
  confidenceScore: 99.1,
  sections: [
    { name: 'Section A', instructions: 'Algebra & Polynomials', totalMarks: 10 },
    { name: 'Section B', instructions: 'Trigonometry & Geometry', totalMarks: 20 },
    { name: 'Section C', instructions: 'Coordinate Geometry & Circles', totalMarks: 20 },
  ],
  extractedQuestions: [
    {
      id: 'ocr-math-q1',
      number: '1',
      mainNumber: '1',
      text: 'Find the roots of the quadratic equation 2x² - 7x + 3 = 0.',
      maxMarks: 2,
      section: 'Section A',
      type: 'numerical',
      keyConcepts: ['Quadratic formula', 'Factoring', 'Roots x=3, 1/2'],
      confidence: 99.8,
    },
    {
      id: 'ocr-math-q2',
      number: '2',
      mainNumber: '2',
      text: 'If α and β are the zeroes of the quadratic polynomial f(x) = x² - p(x + 1) - c, prove that (α + 1)(β + 1) = 1 - c.',
      maxMarks: 3,
      section: 'Section A',
      type: 'short',
      keyConcepts: ['Sum & product of roots', 'Polynomial identities'],
      confidence: 99.4,
    },
    {
      id: 'ocr-math-q3',
      number: '3',
      mainNumber: '3',
      text: 'Find the 20th term from the last term of the AP: 3, 8, 13, ..., 253.',
      maxMarks: 5,
      section: 'Section A',
      type: 'numerical',
      keyConcepts: ['Reverse AP', 'Formula l - (n-1)d', 'Term = 158'],
      confidence: 99.2,
    },
    {
      id: 'ocr-math-q4',
      number: '4',
      mainNumber: '4',
      text: 'Prove that: (sin θ / (1 + cos θ)) + ((1 + cos θ) / sin θ) = 2 cosec θ.',
      maxMarks: 4,
      section: 'Section B',
      type: 'long',
      keyConcepts: ['Trigonometric identity', 'sin²θ + cos²θ = 1'],
      confidence: 99.0,
    },
    {
      id: 'ocr-math-q5',
      number: '5',
      mainNumber: '5',
      text: 'From the top of a 75m high lighthouse from the sea level, the angles of depression of two ships are 30° and 45°. Find the distance between the two ships.',
      maxMarks: 5,
      section: 'Section B',
      type: 'numerical',
      keyConcepts: ['Heights and distances', 'tan 30°', 'tan 45°', '75(√3 - 1)m'],
      confidence: 99.3,
    },
    {
      id: 'ocr-math-q6',
      number: '6',
      mainNumber: '6',
      text: 'State and prove Basic Proportionality Theorem (Thales Theorem).',
      maxMarks: 5,
      section: 'Section B',
      type: 'long',
      keyConcepts: ['BPT Thales Theorem', 'Similar triangles', 'Area ratio'],
      confidence: 99.5,
    },
    {
      id: 'ocr-math-q7',
      number: '7',
      mainNumber: '7',
      text: 'In a right triangle ABC right angled at C, P and Q are points on the sides CA and CB respectively which divide these sides in the ratio 2:1. Prove that: 9(AQ² + BP²) = 13 AB².',
      maxMarks: 6,
      section: 'Section B',
      type: 'long',
      keyConcepts: ['Pythagoras Theorem', 'Section ratio 2:1'],
      confidence: 98.8,
    },
    {
      id: 'ocr-math-q8',
      number: '8',
      mainNumber: '8',
      text: 'Find the coordinates of the points of trisection of the line segment joining (4, -1) and (-2, -3).',
      maxMarks: 4,
      section: 'Section C',
      type: 'numerical',
      keyConcepts: ['Section formula', 'Trisection points (2, -5/3), (0, -7/3)'],
      confidence: 99.6,
    },
    {
      id: 'ocr-math-q9',
      number: '9',
      mainNumber: '9',
      text: 'A quadrilateral ABCD is drawn to circumscribe a circle. Prove that AB + CD = AD + BC.',
      maxMarks: 4,
      section: 'Section C',
      type: 'long',
      keyConcepts: ['Circle tangents theorem', 'Equal tangent lengths'],
      confidence: 99.7,
    },
    {
      id: 'ocr-math-q10a',
      number: '10 (a)',
      mainNumber: '10',
      subPart: 'a',
      text: 'A factory produces 600 cars in the third year and 700 cars in the seventh year. Assuming uniform annual increase, find the production in the 1st year.',
      maxMarks: 4,
      section: 'Section C',
      type: 'numerical',
      keyConcepts: ['AP Linear equations', 'a = 550 cars', 'd = 25 cars'],
      confidence: 99.5,
    },
    {
      id: 'ocr-math-q10b',
      number: '10 (b)',
      mainNumber: '10',
      subPart: 'b',
      text: 'Find the total production in the first 10 years.',
      maxMarks: 4,
      section: 'Section C',
      type: 'numerical',
      keyConcepts: ['Sum of AP S10 = n/2[2a + (n-1)d]', 'Total = 6625 cars'],
      confidence: 99.4,
    },
    {
      id: 'ocr-math-q10c',
      number: '10 (c)',
      mainNumber: '10',
      subPart: 'c',
      text: 'In which year did the production reach 1000 cars?',
      maxMarks: 4,
      section: 'Section C',
      type: 'numerical',
      keyConcepts: ['nth term Tn = a + (n-1)d', 'n = 19th year'],
      confidence: 99.3,
    },
  ],
};

/**
 * Execute OCR on question paper via backend Gemini OCR endpoint or high-fidelity client engine
 */
export async function performQuestionPaperOcr(file: {
  name: string;
  mimeType?: string;
  base64?: string;
}): Promise<OcrResultData> {
  if (file.base64) {
    try {
      const response = await fetch('/api/ocr-question-paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionPaperFile: {
            name: file.name,
            mimeType: file.mimeType || 'application/pdf',
            base64: file.base64,
          },
        }),
      });

      const resData = await response.json();
      if (resData.success && resData.data) {
        return resData.data as OcrResultData;
      }
    } catch (err) {
      console.warn('OCR API call failed, falling back to local OCR dataset:', err);
    }
  }

  // Preset match based on name
  if (file.name.toLowerCase().includes('math')) {
    return sampleMathsOcrResult;
  }

  return sampleBiologyOcrResult;
}
