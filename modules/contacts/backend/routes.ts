import { Router } from '../../../api/router.js';
import { successResponse, errorResponse } from '../../../api/response.js';
import { ContactsRepository } from './repository.js';

export function registerRoutes(router: Router): void {
  router.get('/api/v1/contacts', (req, res) => {
    const contacts = ContactsRepository.listContacts({
      contact_type: req.query.contact_type,
      query: req.query.q
    });
    successResponse(res, { contacts });
  });

  router.post('/api/v1/contacts', (req, res) => {
    const { contact_type, first_name, last_name } = req.body || {};
    if (!contact_type || !first_name || !last_name) {
      return errorResponse(res, 'VALIDATION_ERROR', 'contact_type, first_name, and last_name are required', 400);
    }
    try {
      const contact = ContactsRepository.createContact(req.body);
      successResponse(res, { contact }, 201);
    } catch (err: any) {
      return errorResponse(res, 'VALIDATION_ERROR', err.message, 400);
    }
  });

  router.get('/api/v1/contacts/:id', (req, res) => {
    const contact = ContactsRepository.getContactById(req.params.id!);
    if (!contact) {
      return errorResponse(res, 'NOT_FOUND', 'Contact not found', 404);
    }
    successResponse(res, { contact });
  });

  router.put('/api/v1/contacts/:id', (req, res) => {
    try {
      const contact = ContactsRepository.updateContact(req.params.id!, req.body || {});
      if (!contact) {
        return errorResponse(res, 'NOT_FOUND', 'Contact not found', 404);
      }
      successResponse(res, { contact });
    } catch (err: any) {
      return errorResponse(res, 'VALIDATION_ERROR', err.message, 400);
    }
  });

  router.delete('/api/v1/contacts/:id', (req, res) => {
    const deleted = ContactsRepository.deleteContact(req.params.id!);
    if (!deleted) {
      return errorResponse(res, 'NOT_FOUND', 'Contact not found', 404);
    }
    successResponse(res, { deleted: true });
  });
}
