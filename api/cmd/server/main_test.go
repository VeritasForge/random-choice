package main

import (
	"context"
	"io"
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/VeritasForge/random-choice/api/internal/kakao"
)

func listenOnFreePort(t *testing.T) net.Listener {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("포트를 열지 못했다: %v", err)
	}
	return listener
}

func TestRunWaitsForInFlightRequests(t *testing.T) {
	// 정상 종료의 존재 이유를 그대로 시험한다. 종료 신호가 왔을 때 이미 처리 중이던
	// 요청은 끝까지 마쳐야 한다. Shutdown이 Close로 바뀌면 이 시험이 실패한다.
	started := make(chan struct{})
	server := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			close(started)
			time.Sleep(200 * time.Millisecond)
			_, _ = w.Write([]byte("끝까지 처리함"))
		}),
	}
	listener := listenOnFreePort(t)
	url := "http://" + listener.Addr().String() + "/"

	ctx, cancel := context.WithCancel(context.Background())
	runErr := make(chan error, 1)
	go func() { runErr <- run(ctx, server, listener, nil) }()

	type result struct {
		body string
		err  error
	}
	requestDone := make(chan result, 1)
	go func() {
		res, err := http.Get(url)
		if err != nil {
			requestDone <- result{err: err}
			return
		}
		defer res.Body.Close()
		body, err := io.ReadAll(res.Body)
		requestDone <- result{body: string(body), err: err}
	}()

	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("처리기가 시작되지 않았다")
	}
	cancel() // 처리 중에 종료 신호가 온 상황

	select {
	case got := <-requestDone:
		if got.err != nil {
			t.Fatalf("진행 중이던 요청이 끊겼다: %v", got.err)
		}
		if got.body != "끝까지 처리함" {
			t.Errorf("응답이 %q다. 끝까지 처리됐어야 한다", got.body)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("요청이 끝나지 않았다")
	}

	select {
	case err := <-runErr:
		if err != nil {
			t.Errorf("정상 종료인데 오류를 돌려줬다: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("run이 끝나지 않았다")
	}
}

func TestRunStopsAcceptingAfterShutdown(t *testing.T) {
	server := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte("ok"))
		}),
	}
	listener := listenOnFreePort(t)
	url := "http://" + listener.Addr().String() + "/"

	ctx, cancel := context.WithCancel(context.Background())
	runErr := make(chan error, 1)
	go func() { runErr <- run(ctx, server, listener, nil) }()

	// 종료 전에는 받아 준다.
	res, err := http.Get(url)
	if err != nil {
		t.Fatalf("종료 전 요청이 실패했다: %v", err)
	}
	_ = res.Body.Close()

	cancel()
	select {
	case err := <-runErr:
		if err != nil {
			t.Fatalf("정상 종료인데 오류를 돌려줬다: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("run이 끝나지 않았다")
	}

	// 종료 뒤에는 더 이상 받지 않는다.
	if _, err := http.Get(url); err == nil {
		t.Error("종료한 뒤에도 요청을 받아 줬다")
	}
}

func TestRunReportsListenerFailure(t *testing.T) {
	// Serve가 스스로 멈춘 경우(리스너가 닫힘)에는 그 오류를 그대로 올려야 한다.
	// 이 경로가 죽으면 포트를 이미 쓰고 있는 상황에서도 서버가 조용히 끝난 척한다.
	server := &http.Server{Handler: http.NotFoundHandler()}
	listener := listenOnFreePort(t)
	_ = listener.Close()

	err := run(context.Background(), server, listener, nil)
	if err == nil {
		t.Error("리스너가 닫혔는데 오류를 돌려주지 않았다")
	}
}

func TestTimeoutsAreOrderedOutward(t *testing.T) {
	// 카카오 조회 상한 < 응답 쓰기 상한 < 종료 대기 순서가 지켜져야 한다.
	// 뒤집히면 아직 살아 있어도 되는 요청을 정상 종료가 시간 초과로 끊는다.
	//
	// 카카오 쪽 값을 손으로 베끼지 않고 그 패키지에서 직접 읽는다.
	// 베껴 두면 저쪽을 30초로 올려 순서를 뒤집어도 이 시험이 통과한다.
	if writeTimeout <= kakao.DefaultSearchTimeout {
		t.Errorf("writeTimeout(%v)이 카카오 조회 상한(%v)보다 커야 한다",
			writeTimeout, kakao.DefaultSearchTimeout)
	}
	if shutdownTimeout < writeTimeout {
		t.Errorf("shutdownTimeout(%v)이 writeTimeout(%v)보다 짧다. 진행 중인 요청이 끊긴다",
			shutdownTimeout, writeTimeout)
	}
}

func TestRunCallsOnShutdownWhenSignalArrives(t *testing.T) {
	// 이 콜백이 하는 일은 신호 처리를 기본 동작으로 되돌리는 것이다. 빠지면 종료가
	// 길어질 때(최대 25초) 두 번째 Ctrl-C가 삼켜져 프로세스를 끊을 방법이 없어진다.
	server := &http.Server{Handler: http.NotFoundHandler()}
	listener := listenOnFreePort(t)

	ctx, cancel := context.WithCancel(context.Background())
	called := make(chan struct{}, 1)
	runErr := make(chan error, 1)
	go func() {
		runErr <- run(ctx, server, listener, func() { called <- struct{}{} })
	}()

	cancel()
	select {
	case <-called:
	case <-time.After(5 * time.Second):
		t.Fatal("종료를 시작할 때 onShutdown이 불리지 않았다")
	}
	select {
	case <-runErr:
	case <-time.After(5 * time.Second):
		t.Fatal("run이 끝나지 않았다")
	}
}
