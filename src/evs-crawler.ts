import * as cheerio from 'cheerio';

const getAuthRequestConfig = (meterId: string, password: string) => {
	const formData = new URLSearchParams();
	formData.append('txtLoginId', meterId);
	formData.append('txtPassword', password);
	formData.append('btnLogin', 'Login');

	return {
		method: 'POST',
		headers: {
			Accept: 'text/html',
			Connection: 'keep-alive',
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: formData.toString(),
	};
};

export const getAuthStatusAndCookie = async (
	meterId: string,
	password: string
): Promise<{ authStatus: boolean; cookie: string[] | undefined }> => {
	const authConfig = getAuthRequestConfig(meterId, password);
	const authRes = await fetch('https://nus-utown.evs.com.sg/EVSEntApp-war/loginServlet', authConfig);

	const cookie = authRes.headers.get('set-cookie')?.split(',');
	const checkAuthUrl = authRes.url;
	const authStatus = !checkAuthUrl.includes('Invalid');

	return { authStatus, cookie };
};

const getCreditRequestConfig = (cookie: string[]): RequestInit => {
	return {
		method: 'GET',
		headers: {
			Accept: 'text/html',
			Connection: 'keep-alive',
			Cookie: cookie.join('; '),
		},
	};
};

const getMeterCreditFromHtml = (html: string): number => {
	const $ = cheerio.load(html);
	let remainingCredits: string | undefined;

	$('.mainContent_normalText').each((index: number, element: any) => {
		const item = $(element).text();

		if (index === 3) {
			remainingCredits = item;
		}
	});

	if (!remainingCredits) {
		throw Error('Failed to get remaining credits from HTML');
	}

	return Number(remainingCredits.trim().split('$')[1].trim());
};

export const getMeterCreditFromAuthCookie = async (cookie: string[]): Promise<number> => {
	const creditConfig = getCreditRequestConfig(cookie);
	const creditRes = await fetch('https://nus-utown.evs.com.sg/EVSEntApp-war/viewMeterCreditServlet', creditConfig);
    const html = await creditRes.text();
	const remainingCredits = getMeterCreditFromHtml(html);

	return remainingCredits;
};

export const getMeterCreditFromMeteridPassword = async (meterId: string, password: string): Promise<number | undefined> => {
	try {
		const { authStatus, cookie } = await getAuthStatusAndCookie(meterId, password);
		if (!authStatus || !cookie) {
			throw Error('Invalid meterId or password!');
		}
		return await getMeterCreditFromAuthCookie(cookie);
	} catch (error) {
		console.error(error);
	}
};
