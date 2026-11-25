import { Request, Response } from 'express';
import { 
  createWorksheet, 
  listWorksheets, 
  getWorksheetDetails,
  deleteWorksheet
} from '../services/worksheets.service';
import { getRequestOrgId, getRequestUserId } from '../security/request-context';

export const generateWorksheet = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, subject, topic, difficulty } = req.body;
    if (!title || !subject || !topic || !difficulty) {
      res.status(400).json({ success: false, error: 'All fields are required' });
      return;
    }
    const userId = getRequestUserId(req);

    const sheet = await createWorksheet({
      title,
      subject,
      topic,
      difficulty,
      userId,
      organizationId: getRequestOrgId(req) ?? null,
    });

    res.status(201).json({ success: true, data: sheet });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to generate worksheet' });
  }
};

export const getSheets = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getRequestUserId(req);
    const sheets = await listWorksheets(userId);
    res.json({ success: true, data: sheets });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch worksheets' });
  }
};

export const getSheet = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const sheet = await getWorksheetDetails(id, getRequestUserId(req));
    if (!sheet) {
      res.status(404).json({ success: false, error: 'Worksheet not found' });
      return;
    }
    res.json({ success: true, data: sheet });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch worksheet' });
  }
};

export const removeSheet = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const deleted = await deleteWorksheet(id, getRequestUserId(req));
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Worksheet not found' });
      return;
    }
    res.json({ success: true, message: 'Worksheet deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete worksheet' });
  }
};
