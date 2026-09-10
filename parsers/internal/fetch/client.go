// Package fetch — HTTP-клиент для парсеров: единый UA, таймауты,
// rate-limit между запросами, ретраи с бэкоффом.
package fetch

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"time"

	"golang.org/x/net/publicsuffix"
)

const userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 electric-form-pricebot/1.0"

// Client делает не чаще одного запроса в delay.
type Client struct {
	http  *http.Client
	delay time.Duration
	last  time.Time
}

// New создает клиент с паузой delay между запросами.
func New(delay time.Duration) (*Client, error) {
	jar, err := cookiejar.New(&cookiejar.Options{PublicSuffixList: publicsuffix.List})
	if err != nil {
		return nil, err
	}
	return &Client{
		http:  &http.Client{Timeout: 25 * time.Second, Jar: jar},
		delay: delay,
	}, nil
}

// Get возвращает тело страницы как строку. Ретраи: 3 попытки.
func (c *Client) Get(ctx context.Context, url string) (string, error) {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-time.After(time.Duration(attempt) * 2 * time.Second):
			}
		}
		if wait := c.delay - time.Since(c.last); wait > 0 {
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-time.After(wait):
			}
		}
		body, err := c.getOnce(ctx, url)
		c.last = time.Now()
		if err == nil {
			return body, nil
		}
		lastErr = err
	}
	return "", fmt.Errorf("GET %s: %w", url, lastErr)
}

func (c *Client) getOnce(ctx context.Context, url string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	req.Header.Set("Accept-Language", "ru-RU,ru;q=0.9")
	resp, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("http %d", resp.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return "", err
	}
	return string(b), nil
}
