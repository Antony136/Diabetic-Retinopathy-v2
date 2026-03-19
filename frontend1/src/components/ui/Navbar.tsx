import { useNavigate } from "react-router-dom";
import { APP_NAME } from "../../utils/constants";

export default function Navbar() {
  const navigate = useNavigate();

  return (
    <header className="fixed top-0 left-0 right-0 z-[60] bg-transparent font-headline font-semibold tracking-tight">
      <div className="flex justify-between items-center w-full px-8 py-4">
        <div 
          className="text-xl font-bold text-slate-100 cursor-pointer"
          onClick={() => navigate('/')}
        >
          {APP_NAME}
        </div>
        <div className="flex items-center gap-6">
          <button 
            onClick={() => navigate('/notifications')}
            className="text-slate-400 hover:text-purple-300 transition-colors scale-95 active:scale-90 transition-transform flex items-center justify-center"
          >
            <span className="material-symbols-outlined">notifications</span>
          </button>
          <button 
            onClick={() => navigate('/profile')}
            className="text-slate-400 hover:text-purple-300 transition-colors scale-95 active:scale-90 transition-transform flex items-center justify-center"
          >
            <span className="material-symbols-outlined">account_circle</span>
          </button>
        </div>
      </div>
    </header>
  );
}
