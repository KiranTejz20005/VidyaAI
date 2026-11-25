import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      // Hand controllers the validated body: unknown keys are stripped and
      // transforms applied, so nothing outside the schema reaches the DB layer.
      if (parsed && typeof parsed === 'object' && 'body' in parsed && parsed.body !== undefined) {
        req.body = parsed.body;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.flatten().fieldErrors,
        });
        return;
      }
      next(error);
    }
  };
};
