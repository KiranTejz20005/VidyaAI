import { Request, Response } from 'express';
import { 
  createGeneratedNotes, 
  listUserNotes, 
  getNoteDetails, 
  deleteNote 
} from '../services/notes.service';
import { getRequestOrgId, getRequestUserId } from '../security/request-context';

export const generateNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, subject, topic, type } = req.body;
    if (!title || !subject || !topic || !type) {
      res.status(400).json({ success: false, error: 'All fields are required' });
      return;
    }
    const userId = getRequestUserId(req);

    const note = await createGeneratedNotes({
      title,
      subject,
      topic,
      type,
      userId,
      organizationId: getRequestOrgId(req) ?? null,
    });

    res.status(201).json({ success: true, data: note });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to generate notes' });
  }
};

export const getNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getRequestUserId(req);
    const notes = await listUserNotes(userId);
    res.json({ success: true, data: notes });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch notes list' });
  }
};

export const getNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const note = await getNoteDetails(id, getRequestUserId(req));
    if (!note) {
      res.status(404).json({ success: false, error: 'Notes not found' });
      return;
    }
    res.json({ success: true, data: note });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch notes details' });
  }
};

export const removeNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const deleted = await deleteNote(id, getRequestUserId(req));
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Notes not found' });
      return;
    }
    res.json({ success: true, message: 'Notes deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete notes' });
  }
};
