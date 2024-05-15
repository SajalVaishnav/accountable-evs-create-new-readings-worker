import { createClient } from '@supabase/supabase-js';
import { Tables } from '@/database.types';
import { getMeterCreditFromMeteridPassword } from '@/evs-crawler';

export default {
	async scheduled(event: ScheduledEvent, env: Env) {
		if(!env.SUPABASE_URL || !env.SUPABASE_KEY || env.SUPABASE_URL === '' || env.SUPABASE_KEY === ''	) {
			throw new Error('Missing SUPABASE_URL or SUPABASE_KEY');
		}

		const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

		const startTime = new Date().toISOString();
		console.log('Starting create-new-meter-readings-worker at', startTime);

		const {
			data: meters,
			status: status,
			statusText: statusText,
			error: fetchMetersError,
		} = await supabase
			.from('Meter')
			.select()
			.lte('readingUpdatedAt', new Date(Date.now() - 86400000).toISOString()) // 24 hours ago
			.limit(100);

		if (fetchMetersError || status !== 200 || !meters || meters.length === 0) {
			console.error('Failed fetching meters or no meters found: ', fetchMetersError, statusText);
			return 
		}

		const promises = meters.map(async (meter: Tables<'Meter'>) => {
			try {
				const { meterId, password } = meter;
				const reading = await getMeterCreditFromMeteridPassword(meterId, password); 
				if (reading === undefined) {
					throw new Error(`Failed fetching reading for meterId ${meterId}`);
				}

				const { status, statusText } = await supabase.from('MeterReadings').insert([{ meterId, reading }]);
				if(status !== 201) {
					throw new Error(`Failed creating MeterReading for meterId ${meterId}: ${statusText}`);
				}

				console.log(`Successfully created MeterReading for meterId ${meterId}`);

				const { status: updateStatus, statusText: updateStatusText } = await supabase
					.from('Meter')
					.update({ readingUpdatedAt: new Date().toISOString() })
					.match({ meterId });
				if(updateStatus !== 204) {
					throw new Error(`Failed updating Meter readingUpdatedAt for meterId ${meterId}: ${updateStatusText}`);
				}
				
				console.log(`Successfully completed for meterId ${meterId}`);
			} catch (error) {
				console.error(`Failed for meterId ${meter.meterId}:`, error);
			}
		});

		await Promise.all(promises);

		const endTime = new Date().toISOString();
		const timeTaken = new Date(endTime).getTime() - new Date(startTime).getTime();
		const message = `Finished create-new-meter-readings-worker in ${timeTaken} ms`;
		console.log(message);
	},
};
