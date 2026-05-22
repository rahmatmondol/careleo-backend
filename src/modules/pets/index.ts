import { Elysia } from 'elysia';
import { PetsService } from './service';

export const petsController = new Elysia({ name: 'pets-controller' }).group('/pets', (app) =>
  app
    .get('', async () => PetsService.ping())
    .post('', async () => PetsService.ping())
    .get('/:id', async () => PetsService.ping())
    .put('/:id', async () => PetsService.ping())
    .delete('/:id', async () => PetsService.ping())
);
