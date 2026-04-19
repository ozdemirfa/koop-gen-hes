import { Router } from 'express'
import { validate } from '../middleware/validate'
import { kategoriSchema, gelirGiderSchema, updateGelirGiderSchema } from '../schemas/gelirGider.schema'
import * as gelirGiderController from '../controllers/gelirGider.controller'

const router = Router()

// === KATEGORİLER ===

router.get('/kategoriler', gelirGiderController.getKategoriler)
router.post('/kategoriler', validate({ body: kategoriSchema }), gelirGiderController.createKategori)
router.put('/kategoriler/:id', validate({ body: kategoriSchema }), gelirGiderController.updateKategori)
router.delete('/kategoriler/:id', gelirGiderController.deleteKategori)

// === GELİR/GİDER ===

router.get('/', gelirGiderController.getGelirGider)
router.get('/:id', gelirGiderController.getGelirGiderById)
router.post('/', validate({ body: gelirGiderSchema }), gelirGiderController.createGelirGider)
router.put('/:id', validate({ body: updateGelirGiderSchema }), gelirGiderController.updateGelirGider)
router.delete('/:id', gelirGiderController.deleteGelirGider)

export default router
