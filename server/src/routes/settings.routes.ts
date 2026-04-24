import { Router } from 'express'
import { validate } from '../middleware/validate'
import { birimSchema, pozSchema } from '../schemas/settings.schema'
import {
  getBirimler,
  createBirim,
  deleteBirim,
  getPozlar,
  createPoz,
  updatePoz,
  deletePoz
} from '../controllers/settings.controller'

const router = Router()

// Birimler
router.get('/birimler', getBirimler)
router.post('/birimler', validate({ body: birimSchema }), createBirim)
router.delete('/birimler/:id', deleteBirim)

// Pozlar
router.get('/pozlar', getPozlar)
router.post('/pozlar', validate({ body: pozSchema }), createPoz)
router.put('/pozlar/:id', validate({ body: pozSchema.partial() }), updatePoz)
router.delete('/pozlar/:id', deletePoz)

export default router
