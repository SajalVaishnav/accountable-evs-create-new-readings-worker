/**
 * Welcome to Cloudflare Workers!
 *
 * This is a template for a Scheduled Worker: a Worker that can run on a
 * configurable interval:
 * https://developers.cloudflare.com/workers/platform/triggers/cron-triggers/
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import { createClient } from '@supabase/supabase-js';
import { Tables } from '@/database.types';
import { getMeterCreditFromMeteridPassword } from '@/evs-crawler';

export default {
	// The scheduled handler is invoked at the interval set in our wrangler.toml's
	// [[triggers]] configuration.
	async scheduled(request: Request, env: Env) {
		if(!env.SUPABASE_URL || !env.SUPABASE_KEY) {
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
			.gte('readingUpdatedAt', new Date(Date.now() - 86400000).toISOString())
			.limit(100);

		if (fetchMetersError || status !== 200 || !meters) {
			console.error('Error fetching meters')
			console.error('error: ', fetchMetersError);
			console.error('status: ', statusText);
			return new Response('Error fetching meters');
		}

		const promises = meters.map(async (meter: Tables<'Meter'>) => {
			try {
				const { meterId, password } = meter;
				const reading = await getMeterCreditFromMeteridPassword(meterId, password); 
				if (reading === undefined) {
					throw new Error(`Failed fetching reading for meterId ${meterId}`);
				}

				const { status } = await supabase.from('MeterReadings').insert([{ meterId, reading }]);
				if(status !== 201) {
					throw new Error(`Failed creating MeterReading for meterId ${meterId}`);
				}

				console.log(`Successfully created MeterReading for meterId ${meterId}`);
			} catch (error) {
				console.error(`Error creating MeterReading for meterId ${meter.meterId}:`, error);
			}
		});

		await Promise.all(promises);

		const endTime = new Date().toISOString();
		console.log('Finished create-new-meter-readings-worker at', endTime);
		const timeTaken = new Date(endTime).getTime() - new Date(startTime).getTime();
		const message = `Finished create-new-meter-readings-worker in ${timeTaken} ms`;

		return new Response(message);
	},
};
