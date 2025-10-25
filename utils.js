export async function fetchAPI(url, headers = {}, method = "GET", body = null) {
    const options = { method, headers };
    if (body && method !== "GET" && method !== "HEAD") {
        if (!headers["Content-Type"] && !headers["content-type"]) {
            options.headers = { ...options.headers, "Content-Type": "application/json" };
        }
        options.body = typeof body === "string" ? body : JSON.stringify(body);
    }
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const contentType = response.headers.get("content-type");
        console.log('Content-Type:', contentType); // Debug log
        const text = await response.text();
        console.log('Raw response text length:', text.length); // Debug log
        try {
            const parsed = JSON.parse(text);
            console.log('Successfully parsed JSON'); // Debug log
            return parsed;
        }
        catch (parseError) {
            console.log('Failed to parse as JSON, returning as text'); // Debug log
            return text;
        }
    }
    catch (error) {
        console.error("fetchAPI error:", error);
        throw error;
    }
}
