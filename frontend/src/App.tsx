function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">家計簿アプリ</h1>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            ダッシュボード
          </h2>
          <p className="text-gray-600">
            家計簿アプリへようこそ。セットアップが完了しました。
          </p>
        </div>
      </main>
    </div>
  );
}

export default App;
