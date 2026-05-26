import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { writeLimiter } from "../middleware/rate-limit.js";
import { addContact, confirmContact, listContacts, removeContact, resendConfirmation } from "../services/contacts.service.js";

export const contactsRouter = Router();

const newContact = z.object({
  label: z.string().min(1).max(40),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(7).max(20).optional().nullable(),
  // v93p7 — privacy-policy promise: caller must confirm the contact
  // gave permission to be listed. Service rejects without this.
  permissionAcknowledged: z.literal(true),
});

contactsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    res.json(await listContacts(req.session!.uid));
  } catch (err) {
    next(err);
  }
});

contactsRouter.post("/", requireAuth, writeLimiter, async (req, res, next) => {
  try {
    const input = newContact.parse(req.body);
    res.status(201).json(await addContact(req.session!.uid, input));
  } catch (err) {
    next(err);
  }
});

contactsRouter.post("/:id/resend", requireAuth, writeLimiter, async (req, res, next) => {
  try {
    res.json(await resendConfirmation(req.session!.uid, req.params.id));
  } catch (err) {
    next(err);
  }
});

contactsRouter.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    res.json(await removeContact(req.session!.uid, req.params.id));
  } catch (err) {
    next(err);
  }
});

// Public — clicked from the confirmation email. No auth.
contactsRouter.post("/confirm/:token", async (req, res, next) => {
  try {
    res.json(await confirmContact(req.params.token));
  } catch (err) {
    next(err);
  }
});
