import { useState, useEffect } from "react";
import supabase from "../../lib/supabaseClient";

// Define the structure of the medicine object
interface Medicine {
  nombre_medicamento: string;
  upc: string;
  precio_en_pesos: number;
}

const SearchMedicines = () => {
  // Define the types of the state variables
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    const fetchMedicines = async () => {
      if (searchTerm.length === 0) {
        setMedicines([]);
        return;
      }

      setIsLoading(true);

      try {
        const { data, error } = await supabase
          .from("medicamentos")
          .select("nombre_medicamento, upc, precio_en_pesos")
          .ilike("nombre_medicamento", `%${searchTerm}%`);

        if (error) {
          console.error("Error fetching medicines:", error);
        } else {
          setMedicines(data as Medicine[]); // Type-casting to Medicine[]
        }
      } finally {
        setIsLoading(false);
      }
    };

    // Adding debounce to avoid too many requests while typing
    const delayDebounceFn = setTimeout(() => {
      fetchMedicines();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* Search input */}
      <div className="relative mb-6">
        <input
          type="text"
          placeholder="Buscar medicamento..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-4 pl-10 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
        />
        <div className="absolute left-3 top-4 text-gray-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center my-8">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* Medicines results displayed in cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {medicines.map((medicine, index) => (
          <div
            key={index}
            className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow duration-300"
          >
            <div className="p-5">
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                {medicine.nombre_medicamento}
              </h3>

              <div className="space-y-2 text-gray-600">
                <div className="flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 mr-2 text-blue-500"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2H5a1 1 0 010-2V4zm3 1h2v2H7V5zm4 0h2v2h-2V5z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>UPC: {medicine.upc}</span>
                </div>

                <div className="flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 mr-2 text-green-500"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-medium">
                    Precio: ${medicine.precio_en_pesos.toFixed(2)}
                  </span>
                </div>
              </div>

              <button className="mt-4 w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-md transition-colors duration-300">
                Ver detalles
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* No results message */}
      {!isLoading && searchTerm.length > 0 && medicines.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-12 w-12 mx-auto mb-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p>No se encontraron medicamentos con "{searchTerm}"</p>
        </div>
      )}
    </div>
  );
};

export default SearchMedicines;
