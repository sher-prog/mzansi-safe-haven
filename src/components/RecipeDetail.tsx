import { motion } from "framer-motion";
import { ArrowLeft, Clock, Users, ChefHat } from "lucide-react";

export interface Recipe {
  title: string;
  desc: string;
  time: string;
  serves: string;
  image: string;
  ingredients: string[];
  method: string[];
}

interface RecipeDetailProps {
  recipe: Recipe;
  onBack: () => void;
}

const RecipeDetail = ({ recipe, onBack }: RecipeDetailProps) => {
  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="min-h-screen bg-background"
    >
      {/* Hero image */}
      <div className="relative">
        <img
          src={recipe.image}
          alt={recipe.title}
          className="w-full h-64 object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        <button
          onClick={onBack}
          className="absolute top-4 left-4 bg-background/80 backdrop-blur-sm rounded-full p-2"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="px-5 -mt-8 relative z-10 pb-10">
        <h1 className="font-display text-2xl font-bold text-foreground">
          {recipe.title}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{recipe.desc}</p>

        <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" /> {recipe.time}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="w-4 h-4" /> Serves {recipe.serves}
          </span>
        </div>

        {/* Ingredients */}
        <div className="mt-6">
          <h2 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-primary" />
            Ingredients
          </h2>
          <ul className="mt-3 space-y-2">
            {recipe.ingredients.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Method */}
        <div className="mt-6">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Method
          </h2>
          <ol className="mt-3 space-y-4">
            {recipe.method.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-foreground">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </motion.div>
  );
};

export default RecipeDetail;
