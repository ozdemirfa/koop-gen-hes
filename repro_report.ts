
import { raporService } from './server/src/services/rapor.service';

async function test() {
  const projeId = 'abbfd90a-50c3-45c2-89db-3e7667732f4d';
  const yil = 2026;
  
  try {
    console.log('Testing yillikRapor...');
    const data = await raporService.yillikRapor(yil, projeId);
    console.log('Success:', JSON.stringify(data, null, 2).substring(0, 100) + '...');
  } catch (err) {
    console.error('Error in yillikRapor:', err);
  }
}

test();
