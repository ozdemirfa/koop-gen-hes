import { Router } from 'express'
import { validate } from '../middleware/validate'
import { cariHareketSchema } from '../schemas/cariHesap.schema'
import * as cariHesapController from '../controllers/cariHesap.controller'

const router = Router()

router.get('/', cariHesapController.getCariHareketler)
router.post('/', validate({ body: cariHareketSchema }), cariHesapController.createCariHareket)

export default router
